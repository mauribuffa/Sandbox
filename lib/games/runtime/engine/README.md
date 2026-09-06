# Engine primitives

Fourteen files of Three.js game code, seeded into every game's sandbox. Read the
ones a game needs with `read_file`, paste them into `index.html`, build on top.

## Why they get pasted rather than imported

The player reaches the game through a proxy that fetches the document and
nothing else, so `<script src="./engine/engine.js">` is a 404 and always will be.
`index.html` has to carry every line it runs.

That makes these files a **source library, not a runtime dependency**. Nothing
here imports anything else, nothing exports, and no two files declare the same
name — so any subset of them concatenated into one `<script type="module">` is
valid. Paste only what the game uses. Half of this directory is the wrong answer
for a game of pong.

## The document a 3D game starts from

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Game</title>
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #0b0d12; }
      #app { position: fixed; inset: 0; }
    </style>
    <script type="importmap">
      { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js" } }
    </script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import * as THREE from "three"

      /* --- primitives pasted here --- */
      /* --- game below --- */
    </script>
  </body>
</html>
```

Three points about that boilerplate, each of which breaks the page if changed:

- The import map has to come **before** the module script that uses it, and
  there can only be one per document.
- `three.module.js` pulls `three.core.js` from the same CDN directory by itself.
  Do not add an entry for it.
- To use anything from `three/addons` — `GLTFLoader`, `EffectComposer` — add a
  second mapping, trailing slash included, and pin the same version:
  `"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"`.
  Every addon is one more file that can fail to load; take them only when the
  game genuinely needs one.

## The files

| File | Gives you | Take it when |
| --- | --- | --- |
| `engine.js` | `createEngine` | Always. Renderer, camera, loop, panel resizing, context-loss recovery. |
| `materials.js` | `PALETTE`, `flat`, `toon`, `glow`, `unlit`, `glass`, `gradientTexture`, `checkerTexture`, `stripeTexture`, `noiseTexture`, `textTexture` | Almost always. Colours and canvas-drawn textures. |
| `lighting.js` | `lightingRig`, `configureShadows`, `followShadowCamera`, `blobShadow` | Anything lit — which is anything not using `unlit`. |
| `models.js` | `makeCharacter`, `makeRobot`, `makeCar`, `makeShip`, `makeCoin`, `makeGem`, `makeCrate`, `makeBarrel`, `makeTree`, `makeRock`, `makeCloud`, `makeHeart`, `makeSpike`, `makeRing`, `makeGround`, `makeSkyDome`, `makeStarfield`, `makeLogoCube`, `makeLabel`, `makeInstancedField`, `measure` | You need something on screen and do not want to build it from boxes by hand. Needs `materials.js`. |
| `input.js` | `createInput` | Anything the player controls. Keyboard, pointer, touch, gamepad, merged. |
| `controls.js` | `orbitRig`, `followRig`, `topDownRig`, `firstPersonRig`, `sideScrollRig` | The camera is not bolted in one place. |
| `hud.js` | `createHUD` | Always. Score, bars, banners, toasts, the title screen, on-screen controls. |
| `audio.js` | `createAudio` | Always. Every sound synthesised; no file to load. |
| `animation.js` | `Easing`, `damp`, `dampVec3`, `dampAngle`, `createTweens`, `Spring`, `Vec3Spring`, `createTimeline`, `createShake`, `createMixer`, `spin`, `bob` | Anything that should move smoothly rather than jump. |
| `physics.js` | `createCharacterController`, `sphereOverlap`, `boxOverlap`, `resolveOverlap`, `clampToBounds`, `groundHeightAt`, `createSpatialGrid`, `forwardOf` | Gravity, jumping, or things bumping into each other. |
| `particles.js` | `createParticles` | Impacts, explosions, trails, sparkle. One pooled draw call. |
| `entities.js` | `createPool`, `createEntityList`, `createSpawner`, `createWaves` | Anything spawns repeatedly — bullets, enemies, pickups. |
| `state.js` | `createStateMachine`, `createScore`, `createCountdown`, `createDifficulty` | There is a menu, a game-over screen, or a score. |
| `postfx.js` | `applyLook`, `createOverlay`, `createBloom`, `LOOKS` | Tone-mapping presets, vignette, hit flash. Bloom needs addons — read the file's header first. |

Order barely matters, since everything is a declaration and nothing runs at the
top level. Keep `materials.js` above `models.js` for readability. Never paste the
same file twice: two `const PALETTE` in one module is a `SyntaxError`, and the
page renders blank with the reason only in a console nobody is looking at.

## A complete game

Fifty lines, using nine of the files. Movement, a goal, feedback, a restart.

```js
import * as THREE from "three"
// materials.js, models.js, lighting.js, engine.js, input.js, controls.js,
// hud.js, audio.js, physics.js, state.js pasted here.

const engine = createEngine({
  container: document.getElementById("app"),
  background: PALETTE.ink,
  fog: { color: PALETTE.ink, near: 34, far: 88 },
})

const lights = lightingRig(engine.scene, "night")
configureShadows(engine.renderer, lights.sun, { extent: 26 })
engine.add(makeGround({ size: 90, grid: true }))

const player = makeCharacter({ color: PALETTE.brand, accent: PALETTE.cream })
engine.add(player)

const body = createCharacterController(player, { speed: 9, jumpSpeed: 12 })
const camera = followRig(engine.camera, player, { offset: new THREE.Vector3(0, 6, -11) })
const input = createInput({ target: engine.canvas })
input.bind("jump", ["Space", "KeyW", "ArrowUp"])

const audio = createAudio()
const hud = createHUD({ container: document.body, input })
const readout = hud.readout({ label: "Coins", value: 0 })
hud.hint(["Move: WASD or arrows", "Jump: Space"])
hud.touchControls({ buttons: [{ label: "JUMP", code: "Space" }] })

const score = createScore({ onChange: (value) => readout.set(value) })
const bounds = { minX: -42, maxX: 42, minZ: -42, maxZ: 42 }

const coins = []
const scatter = () => {
  for (const coin of coins) engine.remove(coin)
  coins.length = 0
  for (let i = 0; i < 14; i++) {
    const coin = makeCoin()
    coin.position.set(Math.random() * 76 - 38, 0, Math.random() * 76 - 38)
    coins.push(engine.add(coin))
  }
}

const title = hud.screen({
  title: "Cube Run",
  body: "Collect all fourteen coins.",
  action: "Play",
  onAction: () => (title.hide(), game.set("playing")),
})

const game = createStateMachine(
  {
    menu: {},
    playing: {
      enter() {
        score.reset()
        player.position.set(0, 0, 0)
        body.stop()
        scatter()
      },
      update(dt) {
        body.move(input.axis(), dt)
        if (input.actionPressed("jump")) {
          body.jump()
          audio.sfx.jump()
        }
        body.update(dt)
        clampToBounds(player, bounds)

        for (let i = coins.length - 1; i >= 0; i--) {
          coins[i].rotation.y += dt * 3
          if (!sphereOverlap(player, coins[i], 0.3)) continue

          engine.remove(coins[i])
          coins.splice(i, 1)
          score.add(10)
          audio.sfx.coin()
          hud.toast("+10")
        }

        if (coins.length === 0) game.set("won")
      },
    },
    won: {
      enter() {
        audio.sfx.win()
        title.update({ title: "Cleared", body: `Score ${score.value}`, action: "Again" })
        title.show()
      },
    },
  },
  "menu"
)

engine.onUpdate((dt) => {
  game.update(dt)
  score.update(dt)
  camera.update(dt)
  // Last, always: this is what turns a one-frame press back off.
  input.endFrame()
})

engine.start()
```

## Things that will cost you an hour if nobody says them

- **`input.endFrame()` goes last in the update.** Without it `pressed` never
  clears and one tap fires a jump every frame for the rest of the game.
- **Point and spot lights need large intensities.** Lights have been physically
  correct since r155 and there is no legacy mode. A `PointLight` five units up
  with the default `decay: 2` needs an intensity near 25 to light anything;
  at 1 it renders as black. Directional, ambient and hemisphere lights take the
  small numbers you expect.
- **+Z is forward for models.** `Object3D.lookAt` aims a mesh's +Z axis at its
  target, and everything in `models.js` is built facing +Z to match. The camera
  is the exception — a camera looks down -Z.
- **`localStorage` throws here, it does not merely fail.** The frame is on an
  opaque origin. No high score survives a reload, and touching storage inside a
  `try` you forgot to write takes the whole game down.
- **Pointer Lock does not work here either.** The frame lacks
  `allow-pointer-lock`. Use `firstPersonRig`, which is drag-to-look, and never
  promise a mouselook shooter.
- **Nothing is focused when the page loads.** Keyboard events only reach a frame
  that has focus, which is why every game opens on a `hud.screen` with a button:
  its click takes focus and unlocks audio in the same gesture.
- **Size to the container, never to `window.innerWidth`.** `createEngine`
  already watches its container. A game that reads window dimensions itself will
  be wrong the moment the user drags the panel.
- **Custom `ShaderMaterial` needs two includes.** End the fragment shader with
  `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` or it
  will be the one object in the scene whose colours do not match.
- **Pool anything that spawns repeatedly.** Three.js geometries and materials
  hold GPU memory that garbage collection does not reclaim. `createPool` exists
  for this.
