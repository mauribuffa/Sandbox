// ---------------------------------------------------------------------------
// engine.js — the render loop, the renderer, and the panel it has to fit.
//
// Needs: THREE
// Gives you: createEngine
//
// Everything here exists because of how this runtime serves a game: the page is
// framed in a panel the user drags wider and narrower, so there is no window
// size to size against, and the frame can lose its WebGL context when the
// browser is under pressure. `createEngine` owns those two problems so the game
// does not have to.
// ---------------------------------------------------------------------------

// A frame longer than this is a tab that was in the background, not a slow
// frame. Passing that delta to the game would teleport every moving thing
// through every wall, so it is clamped to something a physics step survives.
const MAX_FRAME_DELTA = 1 / 15

function createEngine(options = {}) {
  const {
    container = document.body,
    background = 0x0b0d12,
    fog = null, // { color, near, far } or { color, density } for exponential
    fov = 55,
    near = 0.1,
    far = 400,
    shadows = true,
    antialias = true,
    // Retina at 3x costs 9x the pixels for a difference nobody sees in a small
    // panel, so the ratio is capped rather than taken as given.
    pixelRatioCap = 2,
    toneMapping = THREE.ACESFilmicToneMapping,
    exposure = 1,
  } = options

  const scene = new THREE.Scene()
  if (background !== null) scene.background = new THREE.Color(background)

  if (fog) {
    scene.fog =
      fog.density !== undefined
        ? new THREE.FogExp2(fog.color, fog.density)
        : new THREE.Fog(fog.color, fog.near ?? 10, fog.far ?? 120)
  }

  const camera = new THREE.PerspectiveCamera(fov, 1, near, far)
  camera.position.set(0, 4, 10)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({
    antialias,
    powerPreference: "high-performance",
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = toneMapping
  renderer.toneMappingExposure = exposure

  if (shadows) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }

  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  canvas.style.touchAction = "none" // or a drag scrolls the page instead of playing
  container.appendChild(canvas)

  const viewport = { width: 1, height: 1, aspect: 1, portrait: false }
  const updaters = []
  const resizers = []
  const raycaster = new THREE.Raycaster()

  let running = false
  let rafId = 0
  let lastTime = 0
  let contextLost = false
  let render = () => renderer.render(scene, camera)

  const engine = {
    scene,
    camera,
    renderer,
    canvas,
    container,
    viewport,
    raycaster,
    time: 0, // seconds of play, excluding time spent paused
    frame: 0,
    paused: false,
    speed: 1, // 0.5 for slow motion, 0 for a freeze frame

    add: (...objects) => (scene.add(...objects), objects[0]),
    remove: (...objects) => scene.remove(...objects),

    // fn(dt, engine) — called once a frame, in the order registered.
    onUpdate(fn) {
      updaters.push(fn)
      return () => {
        const i = updaters.indexOf(fn)
        if (i !== -1) updaters.splice(i, 1)
      }
    },

    // Replaces what happens at the end of a frame. postfx.js uses this to put
    // an EffectComposer in the renderer's place; pass nothing to put the plain
    // renderer back.
    setRenderer(fn) {
      render = fn ? () => fn(engine) : () => renderer.render(scene, camera)
      return engine
    },

    // fn(width, height, engine) — called on every panel resize and once now.
    onResize(fn) {
      resizers.push(fn)
      fn(viewport.width, viewport.height, engine)
      return () => {
        const i = resizers.indexOf(fn)
        if (i !== -1) resizers.splice(i, 1)
      }
    },

    // Pulls the camera back until a sphere of `radius` around `target` fits in
    // BOTH axes. Fitting vertically alone is what crops a game in half when the
    // user drags the panel narrow, so the horizontal field of view is checked
    // too and the looser of the two wins.
    fit(radius, target = new THREE.Vector3(), margin = 1.15) {
      const vFov = THREE.MathUtils.degToRad(camera.fov)
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
      const distance =
        Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * margin

      const direction = camera.position.clone().sub(target)
      if (direction.lengthSq() < 1e-6) direction.set(0, 0.5, 1)

      camera.position.copy(target).add(direction.normalize().multiplyScalar(distance))
      camera.lookAt(target)
      return distance
    },

    // Objects under a normalized (-1..1) screen point. `input.pointer` is
    // already in that space, so: engine.pick(input.pointer, targets).
    pick(ndc, objects = scene.children, recursive = true) {
      raycaster.setFromCamera(ndc, camera)
      return raycaster.intersectObjects(objects, recursive)
    },

    start() {
      if (running) return engine
      running = true
      lastTime = performance.now()
      rafId = requestAnimationFrame(tick)
      return engine
    },

    stop() {
      running = false
      cancelAnimationFrame(rafId)
      return engine
    },

    dispose() {
      engine.stop()
      resizeObserver?.disconnect()
      window.removeEventListener("resize", resize)
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("webglcontextlost", onContextLost)
      canvas.removeEventListener("webglcontextrestored", onContextRestored)
      disposeObject(scene)
      renderer.dispose()
      canvas.remove()
    },
  }

  function tick(now) {
    if (!running) return
    rafId = requestAnimationFrame(tick)

    const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_DELTA) * engine.speed
    lastTime = now

    if (contextLost) return

    if (!engine.paused) {
      engine.time += dt
      engine.frame++
      for (let i = 0; i < updaters.length; i++) updaters[i](dt, engine)
    }

    render()
  }

  function resize() {
    // The panel, not the window: `container` is what the user is dragging.
    const rect =
      container === document.body
        ? { width: window.innerWidth, height: window.innerHeight }
        : container.getBoundingClientRect()

    const width = Math.max(1, Math.floor(rect.width))
    const height = Math.max(1, Math.floor(rect.height))
    if (width === viewport.width && height === viewport.height) return

    viewport.width = width
    viewport.height = height
    viewport.aspect = width / height
    viewport.portrait = height > width

    camera.aspect = viewport.aspect
    camera.updateProjectionMatrix()

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap))
    renderer.setSize(width, height, false)

    for (let i = 0; i < resizers.length; i++) resizers[i](width, height, engine)
  }

  function onVisibility() {
    // Nothing to reset on the clock: the delta clamp above already absorbs the
    // gap. This only keeps a hidden frame from being simulated at all.
    if (document.hidden) engine.paused = true
  }

  // A frame that loses its GPU context throws away every buffer it uploaded.
  // Swallowing the event is what lets the browser hand a new one back instead
  // of leaving a permanently black canvas.
  function onContextLost(event) {
    event.preventDefault()
    contextLost = true
  }

  function onContextRestored() {
    contextLost = false
    lastTime = performance.now()
  }

  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize)
  resizeObserver?.observe(container === document.body ? document.documentElement : container)
  window.addEventListener("resize", resize)
  document.addEventListener("visibilitychange", onVisibility)
  canvas.addEventListener("webglcontextlost", onContextLost)
  canvas.addEventListener("webglcontextrestored", onContextRestored)

  resize()

  return engine
}

// Frees the GPU memory behind a subtree. Worth calling when a level is torn
// down and rebuilt; skipping it is how a game that restarts ten times runs out
// of texture memory.
function disposeObject(root) {
  root.traverse((child) => {
    child.geometry?.dispose()

    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : []

    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.dispose()
      }
      material.dispose()
    }
  })

  root.parent?.remove(root)
}
