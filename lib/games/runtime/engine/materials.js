// ---------------------------------------------------------------------------
// materials.js — the palette, the material factories, and textures drawn in a
// canvas rather than fetched.
//
// Needs: THREE
// Gives you: PALETTE, flat, toon, glow, unlit, glass, gradientTexture,
//            checkerTexture, stripeTexture, noiseTexture, textTexture,
//            disposeMaterialCache
//
// No image ever reaches this runtime over the network, so every texture here is
// painted into a `<canvas>` at startup. That is not a compromise — it is sharp
// at any resolution, costs one frame, and cannot fail to load.
// ---------------------------------------------------------------------------

// Pulled off the product mark: an orange tile with an isometric cube on it,
// whose three faces are white at falling opacity. `cream`/`creamMid`/`creamDim`
// are those three faces resolved against the orange, so a shape built from them
// reads as the logo from any angle.
const PALETTE = {
  brand: 0xea580c,
  brandDeep: 0xc2410c,
  brandLit: 0xfb923c,
  cream: 0xffe3d0,
  creamMid: 0xf9c4a6,
  creamDim: 0xf0a278,

  ink: 0x0b0d12,
  inkSoft: 0x171a22,
  slate: 0x64748b,
  white: 0xf8fafc,

  // Hues that hold up next to the brand orange, for the rest of a game's cast.
  teal: 0x2dd4bf,
  violet: 0xa78bfa,
  yellow: 0xfacc15,
  red: 0xef4444,
  green: 0x4ade80,
  blue: 0x60a5fa,
}

// Two meshes sharing one material are one draw call; two identical materials
// are two. The cache is what makes "give me a red one" cheap to call in a loop.
const materialCache = new Map()

function cached(key, build) {
  let material = materialCache.get(key)
  if (!material) {
    material = build()
    materialCache.set(key, material)
  }
  return material
}

// The default look for this library: matte, lit, faceted. `flatShading` is what
// makes low-poly geometry read as deliberate rather than as a low-detail sphere.
function flat(color = PALETTE.brand, options = {}) {
  const {
    roughness = 0.65,
    metalness = 0.05,
    flatShading = true,
    emissive = 0x000000,
    emissiveIntensity = 1,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    shared = true,
  } = options

  const build = () =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      flatShading,
      emissive,
      emissiveIntensity,
      transparent,
      opacity,
      side,
    })

  // A material you intend to animate (fading it out, flashing it on a hit) has
  // to be its own object, or every mesh sharing it flashes too.
  if (!shared) return build()

  return cached(
    `flat:${color}:${roughness}:${metalness}:${flatShading}:${emissive}:${emissiveIntensity}:${transparent}:${opacity}:${side}`,
    build
  )
}

// Banded cel shading. The gradient map is what sets the number of bands: a
// 3-pixel texture sampled with NearestFilter gives three hard steps.
function toon(color = PALETTE.brand, steps = 3, options = {}) {
  const { shared = true } = options
  const build = () =>
    new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(steps) })

  return shared ? cached(`toon:${color}:${steps}`, build) : build()
}

function toonGradient(steps = 3) {
  const key = `toonramp:${steps}`
  let texture = materialCache.get(key)
  if (texture) return texture

  const data = new Uint8Array(steps)
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round((i / (steps - 1 || 1)) * 255)
  }

  texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  materialCache.set(key, texture)
  return texture
}

// Reads as a light source without being one. Real lights cost shader work per
// object; this costs nothing, and paired with `bloom` in postfx it is what makes
// a pickup or a projectile look hot.
function glow(color = PALETTE.brandLit, intensity = 1.6, options = {}) {
  return flat(color, {
    roughness: 1,
    metalness: 0,
    emissive: color,
    emissiveIntensity: intensity,
    ...options,
  })
}

// Ignores every light in the scene. Right for skyboxes, UI-ish billboards and
// anything that has to stay legible no matter where the sun is.
function unlit(color = PALETTE.white, options = {}) {
  const { transparent = false, opacity = 1, side = THREE.FrontSide, shared = true } = options
  const build = () =>
    new THREE.MeshBasicMaterial({ color, transparent, opacity, side, fog: options.fog ?? true })

  return shared ? cached(`unlit:${color}:${transparent}:${opacity}:${side}`, build) : build()
}

function glass(color = PALETTE.white, options = {}) {
  const { roughness = 0.05, thickness = 0.6, ior = 1.45, shared = true } = options
  const build = () =>
    new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness,
      transmission: 1,
      thickness,
      ior,
    })

  return shared ? cached(`glass:${color}:${roughness}:${thickness}:${ior}`, build) : build()
}

// --- Textures, painted rather than loaded ----------------------------------

function canvas2d(width, height) {
  const element = document.createElement("canvas")
  element.width = width
  element.height = height
  return { element, ctx: element.getContext("2d") }
}

// A texture that carries colour has to be tagged sRGB or the renderer treats
// its bytes as linear light and everything comes out washed out.
function asColorTexture(element) {
  const texture = new THREE.CanvasTexture(element)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// stops: ["#ffe3d0", "#ea580c"] or [[0, "#fff"], [0.6, "#ea580c"]]
function gradientTexture(stops, options = {}) {
  const { size = 256, vertical = true } = options
  const { element, ctx } = canvas2d(vertical ? 1 : size, vertical ? size : 1)

  const gradient = ctx.createLinearGradient(0, 0, vertical ? 0 : size, vertical ? size : 0)
  stops.forEach((stop, index) => {
    const [offset, color] = Array.isArray(stop)
      ? stop
      : [index / (stops.length - 1 || 1), stop]
    gradient.addColorStop(offset, color)
  })

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, element.width, element.height)
  return asColorTexture(element)
}

function checkerTexture(colorA = "#171a22", colorB = "#0b0d12", options = {}) {
  const { squares = 8, size = 256 } = options
  const { element, ctx } = canvas2d(size, size)
  const cell = size / squares

  for (let y = 0; y < squares; y++) {
    for (let x = 0; x < squares; x++) {
      ctx.fillStyle = (x + y) % 2 ? colorA : colorB
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
  }

  const texture = asColorTexture(element)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  // Hard edges: a filtered checker turns to grey mush in the distance.
  texture.magFilter = THREE.NearestFilter
  return texture
}

function stripeTexture(colorA = "#ea580c", colorB = "#0b0d12", options = {}) {
  const { stripes = 8, size = 256, diagonal = false } = options
  const { element, ctx } = canvas2d(size, size)

  ctx.fillStyle = colorB
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = colorA

  if (diagonal) {
    ctx.translate(size / 2, size / 2)
    ctx.rotate(Math.PI / 4)
    ctx.translate(-size, -size)
  }

  const width = size / stripes
  for (let i = 0; i < stripes * 2; i++) {
    if (i % 2 === 0) ctx.fillRect(i * width, 0, width / 2, size * 2)
  }

  const texture = asColorTexture(element)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

function noiseTexture(options = {}) {
  const { size = 128, contrast = 1, tint = null } = options
  const { element, ctx } = canvas2d(size, size)
  const image = ctx.createImageData(size, size)

  for (let i = 0; i < size * size; i++) {
    const value = Math.min(255, 128 + (Math.random() - 0.5) * 255 * contrast)
    image.data[i * 4] = value
    image.data[i * 4 + 1] = value
    image.data[i * 4 + 2] = value
    image.data[i * 4 + 3] = 255
  }

  ctx.putImageData(image, 0, 0)

  if (tint) {
    ctx.globalCompositeOperation = "multiply"
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, size, size)
  }

  const texture = asColorTexture(element)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

// The only practical way to get text into the 3D scene here: TextGeometry needs
// a font file, and nothing but the document itself is fetchable.
function textTexture(text, options = {}) {
  const {
    font = "bold 64px system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color = "#ffe3d0",
    background = null,
    padding = 24,
    stroke = null,
    strokeWidth = 6,
  } = options

  const measure = canvas2d(8, 8).ctx
  measure.font = font
  const metrics = measure.measureText(text)
  const lineHeight =
    (metrics.actualBoundingBoxAscent || 48) + (metrics.actualBoundingBoxDescent || 16)

  // Power-of-two dimensions keep mipmapping happy on every driver.
  const width = THREE.MathUtils.ceilPowerOfTwo(metrics.width + padding * 2)
  const height = THREE.MathUtils.ceilPowerOfTwo(lineHeight + padding * 2)
  const { element, ctx } = canvas2d(width, height)

  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }

  ctx.font = font
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  if (stroke) {
    ctx.lineWidth = strokeWidth
    ctx.strokeStyle = stroke
    ctx.lineJoin = "round"
    ctx.strokeText(text, width / 2, height / 2)
  }

  ctx.fillStyle = color
  ctx.fillText(text, width / 2, height / 2)

  const texture = asColorTexture(element)
  texture.userData.aspect = width / height
  return texture
}

// Only meaningful when a whole game is torn down — the cache is shared, so
// clearing it mid-game disposes materials that meshes are still pointing at.
function disposeMaterialCache() {
  for (const entry of materialCache.values()) entry.dispose?.()
  materialCache.clear()
}
