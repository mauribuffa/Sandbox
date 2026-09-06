// ---------------------------------------------------------------------------
// controls.js — camera rigs, written from scratch rather than pulled from CDN.
//
// Needs: THREE
// Gives you: orbitRig, followRig, topDownRig, firstPersonRig, sideScrollRig
//
// Two reasons these are not `OrbitControls` and friends. Every addon is another
// absolute CDN URL that can fail on its own, and a game whose camera is one of
// five known shapes does not need a general-purpose editor control.
//
// One hard limit worth knowing before you design a camera: the Pointer Lock API
// does not work here. The page is framed with `sandbox="allow-scripts"`, which
// does not include `allow-pointer-lock`, so `requestPointerLock()` is refused.
// A mouselook game has to use drag-to-look, which is what `firstPersonRig` does.
// ---------------------------------------------------------------------------

// Frame-rate-independent smoothing. A plain `lerp(a, b, 0.1)` moves 10% of the
// way per FRAME, so it is twice as fast at 120fps as at 60. This moves a fixed
// fraction per SECOND, which is what makes a camera feel the same on any display.
function smoothTowards(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

// Drag to orbit, wheel or pinch to zoom. The standard "look at the thing"
// camera: menus, model viewers, puzzle boards, turn-based grids.
function orbitRig(camera, domElement, options = {}) {
  const {
    target = new THREE.Vector3(),
    distance = 12,
    minDistance = 3,
    maxDistance = 60,
    // Clamped just short of the poles: exactly at one, the camera's up vector
    // and its view direction line up and the view flips over.
    minPolar = 0.05,
    maxPolar = Math.PI / 2 - 0.05,
    damping = 12,
    rotateSpeed = 2.4,
    zoomSpeed = 0.0015,
    autoRotate = 0, // radians per second
    enabled = true,
  } = options

  const spherical = new THREE.Spherical(distance, Math.PI / 3, Math.PI / 4)
  const desired = spherical.clone()
  const pointers = new Map()
  let pinchDistance = 0

  const rig = {
    target: target.clone(),
    enabled,
    autoRotate,

    update(dt) {
      if (rig.autoRotate && pointers.size === 0) desired.theta += rig.autoRotate * dt

      spherical.theta = smoothTowards(spherical.theta, desired.theta, damping, dt)
      spherical.phi = smoothTowards(spherical.phi, desired.phi, damping, dt)
      spherical.radius = smoothTowards(spherical.radius, desired.radius, damping, dt)

      camera.position.setFromSpherical(spherical).add(rig.target)
      camera.lookAt(rig.target)
    },

    setTarget(vector) {
      rig.target.copy(vector)
    },

    dispose() {
      domElement.removeEventListener("pointerdown", onDown)
      domElement.removeEventListener("pointermove", onMove)
      domElement.removeEventListener("pointerup", onUp)
      domElement.removeEventListener("pointercancel", onUp)
      domElement.removeEventListener("wheel", onWheel)
    },
  }

  function onDown(event) {
    if (!rig.enabled) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    domElement.setPointerCapture?.(event.pointerId)
  }

  function onMove(event) {
    const previous = pointers.get(event.pointerId)
    if (!previous || !rig.enabled) return

    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    previous.x = event.clientX
    previous.y = event.clientY

    if (pointers.size === 1) {
      // Normalized by element size so the same swipe turns the same amount
      // whether the panel is 300px or 900px wide.
      const rect = domElement.getBoundingClientRect()
      desired.theta -= (dx / rect.width) * Math.PI * rotateSpeed
      desired.phi = THREE.MathUtils.clamp(
        desired.phi - (dy / rect.height) * Math.PI * rotateSpeed,
        minPolar,
        maxPolar
      )
      return
    }

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const spread = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchDistance) {
        desired.radius = THREE.MathUtils.clamp(
          desired.radius * (pinchDistance / spread),
          minDistance,
          maxDistance
        )
      }
      pinchDistance = spread
    }
  }

  function onUp(event) {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinchDistance = 0
    domElement.releasePointerCapture?.(event.pointerId)
  }

  function onWheel(event) {
    if (!rig.enabled) return
    event.preventDefault()
    desired.radius = THREE.MathUtils.clamp(
      desired.radius * (1 + event.deltaY * zoomSpeed),
      minDistance,
      maxDistance
    )
  }

  domElement.addEventListener("pointerdown", onDown)
  domElement.addEventListener("pointermove", onMove)
  domElement.addEventListener("pointerup", onUp)
  domElement.addEventListener("pointercancel", onUp)
  domElement.addEventListener("wheel", onWheel, { passive: false })

  return rig
}

// Third-person chase camera. Sits at a fixed offset behind the target and
// catches up over time rather than snapping, which is what makes acceleration
// readable — the camera lagging is how speed is communicated.
function followRig(camera, target, options = {}) {
  const {
    // Behind and above. Models face +Z (see models.js), so "behind" is -Z —
    // flip this sign and the camera stares the player in the face while they run.
    offset = new THREE.Vector3(0, 5, -9),
    lookOffset = new THREE.Vector3(0, 1.2, 0),
    positionDamping = 5,
    lookDamping = 9,
    // Rotate the offset with the target, so the camera stays behind it as it
    // turns. Off for a fixed-angle camera that only tracks position.
    followRotation = true,
  } = options

  const desiredPosition = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()
  const currentLook = new THREE.Vector3().copy(target.position).add(lookOffset)

  const rig = {
    offset: offset.clone(),
    lookOffset: lookOffset.clone(),

    update(dt) {
      desiredPosition.copy(rig.offset)
      if (followRotation) desiredPosition.applyQuaternion(target.quaternion)
      desiredPosition.add(target.position)
      camera.position.lerp(desiredPosition, 1 - Math.exp(-positionDamping * dt))

      // The look point is smoothed separately and faster than the position.
      // Sharing one rate makes the camera swing wide on a hard turn; keeping
      // the aim ahead of the body is what keeps the subject centred.
      lookTarget.copy(target.position).add(rig.lookOffset)
      currentLook.lerp(lookTarget, 1 - Math.exp(-lookDamping * dt))
      camera.lookAt(currentLook)
    },

    // Drop the smoothing for one frame — on a respawn or a teleport, where the
    // camera flying across the level would be a bug rather than a flourish.
    snap() {
      desiredPosition.copy(rig.offset)
      if (followRotation) desiredPosition.applyQuaternion(target.quaternion)
      camera.position.copy(desiredPosition.add(target.position))
      currentLook.copy(target.position).add(rig.lookOffset)
      camera.lookAt(currentLook)
    },
  }

  return rig
}

// Fixed angle looking down. The camera for a twin-stick shooter, a tower
// defence board or an isometric dungeon.
function topDownRig(camera, target, options = {}) {
  const { height = 18, back = 10, damping = 6, lookAhead = 0 } = options
  const focus = new THREE.Vector3()
  const desired = new THREE.Vector3()

  const rig = {
    height,
    back,

    update(dt) {
      focus.copy(target.position)

      // Push the frame in the direction of travel so the player sees where they
      // are going rather than where they have been. `userData.velocity` is what
      // physics.js's character controller writes there.
      if (lookAhead && target.userData.velocity) {
        focus.addScaledVector(target.userData.velocity, lookAhead)
      }

      desired.set(focus.x, focus.y + rig.height, focus.z + rig.back)
      camera.position.lerp(desired, 1 - Math.exp(-damping * dt))
      camera.lookAt(focus)
    },
  }

  return rig
}

// Drag-to-look first person. Yaw and pitch live here; moving the body is the
// game's job — read `rig.forward` / `rig.right` and drive whatever you like.
function firstPersonRig(camera, domElement, options = {}) {
  const { lookSpeed = 2.2, maxPitch = Math.PI / 2 - 0.05, invertY = false } = options

  let yaw = 0
  let pitch = 0
  let dragging = false
  let lastX = 0
  let lastY = 0

  const euler = new THREE.Euler(0, 0, 0, "YXZ") // yaw then pitch: no roll, ever

  const rig = {
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    enabled: true,

    update() {
      euler.set(pitch, yaw, 0)
      camera.quaternion.setFromEuler(euler)

      camera.getWorldDirection(rig.forward)
      // Flattened, so looking at the sky does not slow the player down.
      rig.forward.y = 0
      rig.forward.normalize()
      rig.right.crossVectors(rig.forward, camera.up).normalize()
    },

    look(deltaYaw, deltaPitch) {
      yaw -= deltaYaw
      pitch = THREE.MathUtils.clamp(pitch - deltaPitch, -maxPitch, maxPitch)
    },

    dispose() {
      domElement.removeEventListener("pointerdown", onDown)
      domElement.removeEventListener("pointermove", onMove)
      domElement.removeEventListener("pointerup", onUp)
      domElement.removeEventListener("pointercancel", onUp)
    },
  }

  function onDown(event) {
    if (!rig.enabled) return
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    domElement.setPointerCapture?.(event.pointerId)
  }

  function onMove(event) {
    if (!dragging || !rig.enabled) return
    const rect = domElement.getBoundingClientRect()
    rig.look(
      ((event.clientX - lastX) / rect.width) * Math.PI * lookSpeed,
      ((event.clientY - lastY) / rect.height) * Math.PI * lookSpeed * (invertY ? -1 : 1)
    )
    lastX = event.clientX
    lastY = event.clientY
  }

  function onUp(event) {
    dragging = false
    domElement.releasePointerCapture?.(event.pointerId)
  }

  domElement.addEventListener("pointerdown", onDown)
  domElement.addEventListener("pointermove", onMove)
  domElement.addEventListener("pointerup", onUp)
  domElement.addEventListener("pointercancel", onUp)

  rig.update()
  return rig
}

// 2.5D platformer camera: 3D scene, sideways view. The dead zone is the point —
// the camera holds still for small movements and only follows once the player
// leaves a box in the middle, which stops every hop from swaying the screen.
function sideScrollRig(camera, target, options = {}) {
  const {
    distance = 14,
    height = 2,
    deadzone = new THREE.Vector2(2.5, 2),
    damping = 6,
    bounds = null, // { minX, maxX, minY, maxY } to stop at the level edges
  } = options

  const focus = new THREE.Vector3(target.position.x, target.position.y + height, 0)

  return {
    update(dt) {
      const dx = target.position.x - focus.x
      const dy = target.position.y + height - focus.y

      if (Math.abs(dx) > deadzone.x) focus.x += dx - Math.sign(dx) * deadzone.x
      if (Math.abs(dy) > deadzone.y) focus.y += dy - Math.sign(dy) * deadzone.y

      if (bounds) {
        focus.x = THREE.MathUtils.clamp(focus.x, bounds.minX, bounds.maxX)
        focus.y = THREE.MathUtils.clamp(focus.y, bounds.minY, bounds.maxY)
      }

      const alpha = 1 - Math.exp(-damping * dt)
      camera.position.lerp(new THREE.Vector3(focus.x, focus.y, distance), alpha)
      camera.lookAt(focus.x, focus.y, 0)
    },
  }
}
