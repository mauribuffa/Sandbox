// ---------------------------------------------------------------------------
// particles.js — one pooled Points cloud for every spark in the game.
//
// Needs: THREE
// Gives you: createParticles
//
// Every effect shares a single buffer and a single draw call. The alternative —
// a Mesh per spark — is what turns one satisfying explosion into a frame drop,
// because a hundred sparks is a hundred draw calls and the GPU spends its whole
// budget being told about them.
//
// Nothing is allocated after startup either. The pool is filled once at `max`
// and reused, so a game running for ten minutes generates no garbage here and
// never stutters on a collection.
// ---------------------------------------------------------------------------

function createParticles(scene, options = {}) {
  const {
    max = 800,
    additive = true, // right for fire, sparks, magic; turn off for smoke and dust
    scale = 320, // pixel size at one unit of distance
  } = options

  const positions = new Float32Array(max * 3)
  const colors = new Float32Array(max * 3)
  const sizes = new Float32Array(max)
  const alphas = new Float32Array(max)

  // Simulation state lives in plain arrays beside the GPU buffers rather than
  // in objects: no per-particle allocation, and the whole thing stays contiguous.
  const velocities = new Float32Array(max * 3)
  const lives = new Float32Array(max)
  const maxLives = new Float32Array(max)
  const gravities = new Float32Array(max)
  const drags = new Float32Array(max)
  const startSizes = new Float32Array(max)

  let count = 0 // active particles, packed into [0, count)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1))
  // Nothing is ever outside the view for culling purposes; without this, an
  // empty initial bounding sphere makes the whole system vanish.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)

  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: scale } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Perspective size: divide by view-space depth so a spark shrinks with
        // distance the way everything else in the scene does.
        gl_PointSize = aSize * (uScale / max(0.001, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        // Points are square. Discarding outside the inscribed circle and fading
        // toward its edge is what turns the square into a soft dot — and costs
        // nothing next to sampling a texture.
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;

        gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.12, d));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    // Sparks must not occlude one another, and sorting hundreds of them per
    // frame to make that work would cost more than the effect is worth.
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)

  const color = new THREE.Color()

  function spawn(x, y, z, vx, vy, vz, tint, size, life, gravity, drag) {
    // Full pool: drop the new particle rather than growing. A burst nobody
    // notices missing beats a reallocation everybody feels.
    if (count >= max) return

    const i = count++
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    velocities[i * 3] = vx
    velocities[i * 3 + 1] = vy
    velocities[i * 3 + 2] = vz

    color.set(tint)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b

    sizes[i] = size
    startSizes[i] = size
    alphas[i] = 1
    lives[i] = life
    maxLives[i] = life
    gravities[i] = gravity
    drags[i] = drag
  }

  const api = {
    points,
    material,

    get active() {
      return count
    },

    // A one-off spray: an impact, a pickup, an explosion.
    burst(position, options = {}) {
      const {
        count: amount = 20,
        color: tint = 0xea580c,
        speed = 6,
        speedVariance = 0.5,
        spread = 1, // 1 = a full sphere, 0.2 = a narrow cone upward
        size = 0.25,
        sizeVariance = 0.4,
        life = 0.7,
        lifeVariance = 0.3,
        gravity = -12,
        drag = 2,
        direction = null, // a Vector3 to aim the cone along
      } = options

      for (let i = 0; i < amount; i++) {
        // Directions drawn from a normalized gaussian-ish triple give an even
        // sphere; picking each axis uniformly would bunch them at the corners.
        let dx = Math.random() * 2 - 1
        let dy = Math.random() * 2 - 1
        let dz = Math.random() * 2 - 1
        const length = Math.hypot(dx, dy, dz) || 1
        dx /= length
        dy /= length
        dz /= length

        if (direction) {
          dx = direction.x + dx * spread
          dy = direction.y + dy * spread
          dz = direction.z + dz * spread
        }

        const velocity = speed * (1 + (Math.random() - 0.5) * speedVariance)
        spawn(
          position.x,
          position.y,
          position.z,
          dx * velocity,
          dy * velocity,
          dz * velocity,
          tint,
          size * (1 + (Math.random() - 0.5) * sizeVariance),
          life * (1 + (Math.random() - 0.5) * lifeVariance),
          gravity,
          drag
        )
      }
    },

    // A continuous stream behind a moving object — exhaust, a comet tail, a
    // damage smoulder. Call every frame; `rate` is particles per second, so the
    // trail stays the same density however fast the frame is running.
    trail(position, dt, options = {}) {
      const { rate = 40, ...rest } = options
      api._debt = (api._debt ?? 0) + rate * dt
      const emit = Math.floor(api._debt)
      api._debt -= emit
      if (emit > 0) api.burst(position, { count: emit, speed: 1, gravity: 0, ...rest })
    },

    update(dt) {
      for (let i = count - 1; i >= 0; i--) {
        lives[i] -= dt

        if (lives[i] <= 0) {
          // Swap-and-shrink: the dead particle takes the last one's slot, which
          // keeps the active range contiguous without shifting the whole array.
          const last = --count
          if (i !== last) {
            positions.copyWithin(i * 3, last * 3, last * 3 + 3)
            velocities.copyWithin(i * 3, last * 3, last * 3 + 3)
            colors.copyWithin(i * 3, last * 3, last * 3 + 3)
            sizes[i] = sizes[last]
            startSizes[i] = startSizes[last]
            alphas[i] = alphas[last]
            lives[i] = lives[last]
            maxLives[i] = maxLives[last]
            gravities[i] = gravities[last]
            drags[i] = drags[last]
          }
          continue
        }

        const decay = Math.exp(-drags[i] * dt)
        velocities[i * 3] *= decay
        velocities[i * 3 + 1] = velocities[i * 3 + 1] * decay + gravities[i] * dt
        velocities[i * 3 + 2] *= decay

        positions[i * 3] += velocities[i * 3] * dt
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt

        const remaining = lives[i] / maxLives[i]
        alphas[i] = remaining
        sizes[i] = startSizes[i] * (0.3 + remaining * 0.7)
      }

      // The draw range is what keeps the dead tail of the pool off the GPU's
      // work list — without it every frame draws all `max` points, most of them
      // stale, and the pool stops being an optimisation.
      geometry.setDrawRange(0, count)
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.aColor.needsUpdate = true
      geometry.attributes.aSize.needsUpdate = true
      geometry.attributes.aAlpha.needsUpdate = true
    },

    clear() {
      count = 0
      geometry.setDrawRange(0, 0)
    },

    dispose() {
      scene.remove(points)
      geometry.dispose()
      material.dispose()
    },
  }

  return api
}
