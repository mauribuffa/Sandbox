// ---------------------------------------------------------------------------
// postfx.js — screen effects, the cheap ones first.
//
// Needs: THREE, engine.js
// Gives you: applyLook, createOverlay, createBloom, LOOKS
//
// Split deliberately into two halves, because they cost very different things.
//
// `applyLook` and `createOverlay` are free. Tone mapping is a renderer setting,
// and a vignette or a hit flash is a CSS gradient over the canvas — no extra
// render pass, no extra download, and it looks the same as doing it in GLSL
// because a full-screen tint IS a full-screen tint.
//
// `createBloom` is not free. EffectComposer lives in `three/addons`, so it pulls
// four or five more files off the CDN — each an absolute URL that can fail on a
// bad connection and take the whole game with it — and it adds two full-screen
// passes per frame. It is worth it for a neon game where glow is the look. It is
// not worth it to make a coin sparkle: `glow()` from materials.js already does.
// ---------------------------------------------------------------------------

const LOOKS = {
  // Filmic shoulder, slight desaturation in the highlights. The default.
  natural: { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1 },
  // Holds saturation much better in bright areas — right for a neon or
  // synthwave game where ACES would wash the pinks out to white.
  neon: { toneMapping: THREE.AgXToneMapping, exposure: 1.35 },
  // Flat and punchy, closest to "what I typed is what I get". Suits flat-shaded
  // and cel-shaded art, where filmic tone mapping muddies the palette.
  flat: { toneMapping: THREE.NoToneMapping, exposure: 1 },
  soft: { toneMapping: THREE.NeutralToneMapping, exposure: 1.1 },
  bright: { toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.5 },
  moody: { toneMapping: THREE.ACESFilmicToneMapping, exposure: 0.7 },
}

function applyLook(renderer, look = "natural") {
  const config = typeof look === "string" ? LOOKS[look] ?? LOOKS.natural : look
  renderer.toneMapping = config.toneMapping
  renderer.toneMappingExposure = config.exposure
  return renderer
}

// A DOM layer over the canvas for full-screen tints: vignette, damage flash,
// a fade to black between levels, a low-health pulse.
//
// It sits below the HUD (z-index 5 against the HUD's 10) and takes no pointer
// events, so nothing it does can block a button.
function createOverlay(options = {}) {
  const { container = document.body } = options

  const element = document.createElement("div")
  element.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:5",
    "transition:opacity 200ms ease-out",
  ].join(";")
  container.appendChild(element)

  const vignette = document.createElement("div")
  vignette.style.cssText = "position:absolute;inset:0;opacity:0;transition:opacity 300ms ease-out"
  element.appendChild(vignette)

  const flashLayer = document.createElement("div")
  flashLayer.style.cssText = "position:absolute;inset:0;opacity:0"
  element.appendChild(flashLayer)

  const fadeLayer = document.createElement("div")
  fadeLayer.style.cssText =
    "position:absolute;inset:0;opacity:0;background:#0b0d12;transition:opacity 400ms ease-out"
  element.appendChild(fadeLayer)

  return {
    element,

    // Darkened corners. Pulls the eye to the middle of the frame and hides the
    // edge of a small panel; strength 0.4–0.7 is usually enough.
    vignette(strength = 0.5, color = "rgba(11,13,18,1)") {
      vignette.style.background = `radial-gradient(120% 90% at 50% 50%, transparent 40%, ${color} 100%)`
      vignette.style.opacity = String(strength)
      return this
    },

    // A single frame of colour: took damage, picked something up, fired.
    // Instant on, eased off — the reverse reads as a lag, not a hit.
    flash(color = "rgba(239,68,68,0.45)", duration = 0.25) {
      flashLayer.style.transition = "none"
      flashLayer.style.background = color
      flashLayer.style.opacity = "1"

      requestAnimationFrame(() => {
        flashLayer.style.transition = `opacity ${duration}s ease-out`
        flashLayer.style.opacity = "0"
      })
      return this
    },

    // Returns a promise, so a level transition can await the fade.
    fade(to = 1, duration = 0.4) {
      fadeLayer.style.transition = `opacity ${duration}s ease-out`
      fadeLayer.style.opacity = String(to)
      return new Promise((resolve) => setTimeout(resolve, duration * 1000))
    },

    remove: () => element.remove(),
  }
}

// Real bloom, through the composer. Read the note at the top of this file before
// reaching for it — and if you do, add the addons entry to the import map:
//
//   "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"
//
// then, at the top of your module:
//
//   import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
//   import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
//   import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
//   import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
//
// and pass those four in. They are arguments rather than imports here so this
// file stays paste-able into a game that never turns bloom on.
function createBloom(engine, passes, options = {}) {
  const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = passes
  const {
    strength = 0.7,
    radius = 0.5,
    // Only pixels brighter than this glow. Below about 0.8 the whole image
    // blooms and the picture turns to fog; that is the knob to reach for first.
    threshold = 0.85,
    resolutionScale = 0.5,
  } = options

  const composer = new EffectComposer(engine.renderer)
  composer.addPass(new RenderPass(engine.scene, engine.camera))

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(
      engine.viewport.width * resolutionScale,
      engine.viewport.height * resolutionScale
    ),
    strength,
    radius,
    threshold
  )
  composer.addPass(bloom)

  // The composer's intermediate targets are linear; OutputPass is what applies
  // tone mapping and the sRGB conversion at the end. Leave it off and the whole
  // game renders noticeably darker the moment bloom is switched on.
  composer.addPass(new OutputPass())

  engine.setRenderer(() => composer.render())
  engine.onResize((width, height) => composer.setSize(width, height))

  return {
    composer,
    bloom,
    set strength(value) {
      bloom.strength = value
    },
    // Back to the plain renderer — worth doing if the frame rate drops on a
    // weaker machine, since this is usually the most expensive thing on screen.
    disable() {
      engine.setRenderer(null)
    },
    dispose() {
      engine.setRenderer(null)
      composer.dispose?.()
    },
  }
}
