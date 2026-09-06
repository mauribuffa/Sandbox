// ---------------------------------------------------------------------------
// physics.js — movement, collision and the small mercies that make it playable.
//
// Needs: THREE
// Gives you: createCharacterController, sphereOverlap, boxOverlap, resolveOverlap,
//            clampToBounds, groundHeightAt, createSpatialGrid, forwardOf
//
// Not a physics engine, and deliberately: a rigid-body solver is a large
// dependency to fetch over the network for a game whose whole model is "a
// capsule that runs and jumps". What is here is the arcade subset — gravity,
// ground contact, circle overlap — plus coyote time and jump buffering, which
// are the two cheats that separate controls that feel tight from controls that
// feel broken.
// ---------------------------------------------------------------------------

const _direction = new THREE.Vector3()
const _target = new THREE.Vector3()
const _down = new THREE.Vector3(0, -1, 0)
const _ray = new THREE.Raycaster()
const _boxA = new THREE.Box3()
const _boxB = new THREE.Box3()

// A ground-based mover: gravity, acceleration, friction, jumping.
//
//   const body = createCharacterController(player, { speed: 7, jumpSpeed: 9 })
//   body.move(input.axis(), dt, cameraYaw)
//   if (input.actionPressed("jump")) body.jump()
//   body.update(dt)
function createCharacterController(object, options = {}) {
  const {
    speed = 7,
    acceleration = 60,
    friction = 14,
    gravity = 26,
    jumpSpeed = 10,
    airControl = 0.45,
    radius = object.userData.radius ?? 0.4,
    groundY = 0,
    groundObjects = null, // meshes to raycast against; omit for a flat floor
    maxFallSpeed = 45,
    turnSpeed = 14, // 0 to leave the model's facing alone
    // Grace after walking off a ledge during which a jump still works. Players
    // press jump a frame or two late constantly, and without this the game reads
    // as unresponsive rather than as strict.
    coyoteTime = 0.11,
    // The same forgiveness in the other direction: a jump pressed just before
    // landing fires on touchdown instead of being swallowed.
    jumpBuffer = 0.12,
  } = options

  const velocity = new THREE.Vector3()
  object.userData.velocity = velocity // topDownRig's lookAhead reads this

  let timeSinceGrounded = Infinity
  let jumpQueuedFor = 0

  const body = {
    object,
    velocity,
    grounded: false,
    speed,
    jumpSpeed,

    // `direction` is a Vector2 from input.axis(): x right, y forward.
    // `yaw` rotates it into camera space, so "up" means "away from the camera"
    // rather than "along world -Z".
    move(direction, dt, yaw = 0) {
      _direction.set(direction.x, 0, -direction.y)
      if (yaw) _direction.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw)

      const control = body.grounded ? 1 : airControl
      _target.copy(_direction).multiplyScalar(body.speed)

      // Accelerate toward the desired velocity rather than assigning it: an
      // instant velocity change is what makes movement feel like sliding a
      // cursor instead of running.
      const rate = (_direction.lengthSq() > 0 ? acceleration : friction) * control * dt
      velocity.x = THREE.MathUtils.lerp(velocity.x, _target.x, Math.min(1, rate / body.speed))
      velocity.z = THREE.MathUtils.lerp(velocity.z, _target.z, Math.min(1, rate / body.speed))

      if (turnSpeed && _direction.lengthSq() > 0.001) {
        const desired = Math.atan2(_direction.x, _direction.z)
        let delta = ((desired - object.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI
        if (delta < -Math.PI) delta += Math.PI * 2
        object.rotation.y += delta * (1 - Math.exp(-turnSpeed * dt))
      }
    },

    // Always safe to call; it queues rather than failing, and `update` spends
    // the queued jump the moment the character is allowed one.
    jump() {
      jumpQueuedFor = jumpBuffer
    },

    update(dt) {
      timeSinceGrounded += dt
      jumpQueuedFor -= dt

      // Sampled once and reused for both contact tests below. With
      // `groundObjects` this is a raycast, and the terrain does not move far
      // enough inside one frame to be worth casting twice.
      const floor = groundObjects
        ? groundHeightAt(object.position, groundObjects, groundY)
        : groundY

      // Contact is resolved twice a frame, and the order is the whole reason
      // jumping feels right.
      //
      // Once BEFORE the jump, so a press on a frame where the character is
      // already standing launches within that same frame — checking after
      // integration instead would cost every jump a frame of latency, which
      // reads as the button not working.
      //
      // Once AFTER, so a landing is detected on the frame it happens: that is
      // what lets a jump buffered in mid-air fire on touchdown rather than a
      // frame later, and it keeps `grounded` agreeing with the position that is
      // about to be drawn.
      settle(floor)

      if (jumpQueuedFor > 0 && timeSinceGrounded <= coyoteTime) {
        velocity.y = jumpSpeed
        jumpQueuedFor = 0
        timeSinceGrounded = Infinity // one press, one jump
        body.grounded = false
      }

      velocity.y = Math.max(-maxFallSpeed, velocity.y - gravity * dt)
      object.position.addScaledVector(velocity, dt)

      settle(floor)
      return body
    },

    // Knockback, a launch pad, a bounce off an enemy's head.
    impulse(vector) {
      velocity.add(vector)
      body.grounded = false
    },

    stop() {
      velocity.set(0, 0, 0)
    },

    get radius() {
      return radius
    },
  }

  function settle(floor) {
    if (object.position.y <= floor) {
      object.position.y = floor
      if (velocity.y < 0) velocity.y = 0
      body.grounded = true
      timeSinceGrounded = 0
    } else {
      body.grounded = false
    }
  }

  return body
}

// Circle-on-the-floor overlap. `radius` comes from models.js's `measure`, so
// any model built there works with this untouched. Squared lengths only — the
// square root is pure cost when all you need is a comparison.
function sphereOverlap(a, b, extra = 0) {
  const combined = (a.userData.radius ?? 0.5) + (b.userData.radius ?? 0.5) + extra
  return a.position.distanceToSquared(b.position) < combined * combined
}

// Axis-aligned box overlap, for anything a circle is a bad fit for: a platform,
// a wall, a long crate.
function boxOverlap(a, b) {
  _boxA.setFromObject(a)
  _boxB.setFromObject(b)
  return _boxA.intersectsBox(_boxB)
}

// Pushes two overlapping circles apart along the line between them. `weight` 0
// moves only `b` (a player shoving a crate), 0.5 splits it, 1 moves only `a`.
function resolveOverlap(a, b, weight = 0.5) {
  const combined = (a.userData.radius ?? 0.5) + (b.userData.radius ?? 0.5)
  _direction.subVectors(a.position, b.position)
  _direction.y = 0

  const distance = _direction.length()
  if (distance === 0 || distance >= combined) return 0

  const push = combined - distance
  _direction.divideScalar(distance)

  a.position.addScaledVector(_direction, push * (1 - weight))
  b.position.addScaledVector(_direction, -push * weight)
  return push
}

// Keeps an object inside a rectangle, accounting for its own width. The play
// area needs an edge, and a wall of invisible boxes is a lot of work for what
// is really one clamp.
function clampToBounds(object, bounds, radius = object.userData.radius ?? 0) {
  const { minX, maxX, minZ, maxZ } = bounds
  object.position.x = THREE.MathUtils.clamp(object.position.x, minX + radius, maxX - radius)
  object.position.z = THREE.MathUtils.clamp(object.position.z, minZ + radius, maxZ - radius)
  return object
}

// Height of the terrain under a point, by casting down from above it. Use for
// hills, ramps and moving platforms; a flat floor does not need it.
function groundHeightAt(position, colliders, fallback = 0, maxHeight = 50) {
  _target.set(position.x, position.y + maxHeight, position.z)
  _ray.set(_target, _down)
  _ray.far = maxHeight * 2

  const hit = _ray.intersectObjects(colliders, true)[0]
  return hit ? hit.point.y : fallback
}

// Uniform-grid broadphase. Checking every pair is O(n²) — fine for twenty
// objects, a frame-killer at three hundred. This buckets by cell so each object
// only tests the handful that could possibly be touching it.
//
//   grid.rebuild(asteroids)
//   for (const other of grid.near(ship)) if (sphereOverlap(ship, other)) hit(other)
function createSpatialGrid(cellSize = 4) {
  const cells = new Map()
  const key = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`

  const grid = {
    clear: () => cells.clear(),

    insert(object) {
      const id = key(object.position.x, object.position.z)
      let bucket = cells.get(id)
      if (!bucket) cells.set(id, (bucket = []))
      bucket.push(object)
    },

    // Rebuilt each frame rather than updated: with objects that all move every
    // frame, tracking which cell each one left costs more than starting over.
    rebuild(objects) {
      cells.clear()
      for (const object of objects) grid.insert(object)
    },

    // The nine cells around a point — enough as long as nothing has a radius
    // bigger than one cell, which is what `cellSize` is for.
    near(object) {
      const results = []
      const cx = Math.floor(object.position.x / cellSize)
      const cz = Math.floor(object.position.z / cellSize)

      for (let x = cx - 1; x <= cx + 1; x++) {
        for (let z = cz - 1; z <= cz + 1; z++) {
          const bucket = cells.get(`${x},${z}`)
          if (bucket) for (const other of bucket) if (other !== object) results.push(other)
        }
      }

      return results
    },
  }

  return grid
}

// The direction an object is facing, flattened to the ground plane.
//
// `getWorldDirection` reports a mesh's +Z axis, which is the same axis
// `lookAt` aims and the same one models.js builds its models facing — so this
// is forward for anything in the scene. A Camera is the exception: it overrides
// the method to report -Z, because that is the way a camera looks.
function forwardOf(object, out = new THREE.Vector3()) {
  object.getWorldDirection(out)
  out.y = 0
  return out.normalize()
}
