// ---------------------------------------------------------------------------
// lighting.js — lighting rigs, and shadows that stay cheap.
//
// Needs: THREE
// Gives you: lightingRig, configureShadows, followShadowCamera, LIGHT_PRESETS
//
// One thing to know before touching an intensity: since r155 Three.js lights are
// physically correct and there is no legacy mode left to switch back to.
// AmbientLight, HemisphereLight and DirectionalLight take roughly the numbers
// you would expect (0.2–4). PointLight and SpotLight do NOT: their intensity is
// in candela and falls off as 1/distance², so a lamp 5 units from the floor
// needs an intensity near 25 to light it at all, and 1 renders as black. If a
// point light looks broken, it is almost always this.
// ---------------------------------------------------------------------------

const LIGHT_PRESETS = {
  // Open, sunlit, readable — the safe default for a platformer or a racer.
  day: {
    sky: 0xbfdbfe,
    ground: 0x8b6a4a,
    hemisphere: 1.1,
    sunColor: 0xfff3e0,
    sunIntensity: 2.4,
    sunPosition: [8, 14, 6],
    ambient: 0x334155,
    ambientIntensity: 0.25,
  },
  // Dark ground, cold fill, hot rim. Pairs with `glow` materials and bloom.
  night: {
    sky: 0x1e293b,
    ground: 0x020617,
    hemisphere: 0.5,
    sunColor: 0x93c5fd,
    sunIntensity: 0.8,
    sunPosition: [-6, 10, -4],
    ambient: 0x0b0d12,
    ambientIntensity: 0.6,
  },
  // Even, shadow-light, product-shot lighting. Good for menus and previews.
  studio: {
    sky: 0xffffff,
    ground: 0x94a3b8,
    hemisphere: 1.4,
    sunColor: 0xffffff,
    sunIntensity: 1.6,
    sunPosition: [5, 8, 8],
    ambient: 0xffffff,
    ambientIntensity: 0.4,
  },
  // Almost no fill, so anything emissive carries the frame.
  dungeon: {
    sky: 0x1c1917,
    ground: 0x0c0a09,
    hemisphere: 0.3,
    sunColor: 0xfbbf24,
    sunIntensity: 0.5,
    sunPosition: [3, 9, 3],
    ambient: 0x1c1917,
    ambientIntensity: 0.35,
  },
  // One hard key, no bounce — the look of an object lit only by its own star.
  space: {
    sky: 0x0b0d12,
    ground: 0x0b0d12,
    hemisphere: 0.15,
    sunColor: 0xffffff,
    sunIntensity: 3.2,
    sunPosition: [10, 6, 10],
    ambient: 0x1e1b4b,
    ambientIntensity: 0.2,
  },
}

// Builds a three-light rig (hemisphere fill, directional key, ambient floor) and
// hands back the parts, so a game can dim the key at dusk or recolour the fill
// without rebuilding anything.
function lightingRig(scene, preset = "day", overrides = {}) {
  const config = { ...(LIGHT_PRESETS[preset] ?? LIGHT_PRESETS.day), ...overrides }

  const hemisphere = new THREE.HemisphereLight(
    config.sky,
    config.ground,
    config.hemisphere
  )
  hemisphere.position.set(0, 20, 0)

  const sun = new THREE.DirectionalLight(config.sunColor, config.sunIntensity)
  sun.position.set(...config.sunPosition)
  // A directional light aims at its target's position, and the target has to be
  // in the scene for its world matrix to be updated. Forgetting that is why a
  // moved light sometimes appears not to move.
  sun.target.position.set(0, 0, 0)

  const ambient = new THREE.AmbientLight(config.ambient, config.ambientIntensity)

  scene.add(hemisphere, sun, sun.target, ambient)

  return {
    hemisphere,
    sun,
    ambient,

    // Sweeps the key light through an arc and warms it at the ends. `t` is
    // 0 at dawn, 0.5 at noon, 1 at dusk.
    setTimeOfDay(t) {
      const angle = Math.PI * THREE.MathUtils.clamp(t, 0, 1)
      const height = Math.sin(angle)
      sun.position.set(Math.cos(angle) * 14, Math.max(0.5, height * 16), 6)
      sun.intensity = config.sunIntensity * THREE.MathUtils.clamp(height, 0.05, 1)
      sun.color.setHSL(0.09, 0.6, 0.5 + height * 0.4)
      hemisphere.intensity = config.hemisphere * THREE.MathUtils.clamp(height, 0.15, 1)
    },

    dispose() {
      scene.remove(hemisphere, sun, sun.target, ambient)
      sun.shadow?.map?.dispose()
    },
  }
}

// Turns shadows on for one directional or spot light, with a frustum sized to
// the play area rather than the default one.
//
// Shadow cost is entirely about area: the map is a fixed number of texels
// stretched over whatever the shadow camera covers, so a frustum twice as wide
// as it needs to be spends three quarters of its resolution on empty ground and
// makes every edge four times blockier.
function configureShadows(renderer, light, options = {}) {
  const {
    size = 2048,
    extent = 20, // half-width of the area that receives shadows
    near = 0.5,
    far = 60,
    bias = -0.0005,
    normalBias = 0.02,
    radius = 3,
  } = options

  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  light.castShadow = true
  light.shadow.mapSize.set(size, size)
  light.shadow.camera.near = near
  light.shadow.camera.far = far
  light.shadow.radius = radius

  // Shadow acne is the surface shadowing itself through depth-precision error.
  // `bias` pushes the comparison back; `normalBias` shrinks the geometry along
  // its normals, which fixes the same thing without the peter-panning that a
  // large `bias` alone causes.
  light.shadow.bias = bias
  light.shadow.normalBias = normalBias

  if (light.shadow.camera.isOrthographicCamera) {
    light.shadow.camera.left = -extent
    light.shadow.camera.right = extent
    light.shadow.camera.top = extent
    light.shadow.camera.bottom = -extent
  }

  light.shadow.camera.updateProjectionMatrix()
  return light
}

// Keeps a small, sharp shadow frustum centred on whatever the player is looking
// at. Without this, a level bigger than the frustum has to choose between
// shadows that vanish at the edges and a frustum so wide the shadows are mush.
//
// Call once a frame with the player (or the camera target).
function followShadowCamera(light, target, offset = null) {
  const delta = offset ?? light.userData.shadowOffset
  if (!delta) {
    light.userData.shadowOffset = light.position.clone()
    return
  }

  light.position.copy(target.position).add(delta)
  light.target.position.copy(target.position)
  light.target.updateMatrixWorld()
}

// Cheap, always-correct contact shadow: a dark disc parented under an object.
// Costs one transparent quad against a real shadow's whole extra render pass,
// and for a game with a lot of small moving things it reads just as well.
function blobShadow(radius = 0.6, opacity = 0.35) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext("2d")
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, "rgba(0,0,0,1)")
  gradient.addColorStop(0.5, "rgba(0,0,0,0.5)")
  gradient.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      opacity,
      depthWrite: false, // or it punches a hole in whatever is drawn after it
    })
  )

  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.01 // off the floor, or the two planes fight for depth
  mesh.renderOrder = -1
  return mesh
}
