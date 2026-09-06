import type { SystemModelMessage } from "ai"

import { GAME_DIR } from "@/lib/daytona/utils"

// The 3D half of the toolkit. Kept apart from `runtime.ts` because that file is
// about what the machine refuses to do, while this one is about what is already
// sitting in the sandbox waiting to be used — a library that is only useful if
// the model knows it is there and knows it has to be pasted rather than linked.
export const engineInstructions: SystemModelMessage = {
  role: "system",
  content: `# Three.js and the engine primitives

A 3D game here does not start from an empty file. \`${GAME_DIR}/engine/\` is
seeded into every game's sandbox before the first turn: fourteen files of
Three.js game code, already written against this runtime's constraints.

\`${GAME_DIR}/engine/README.md\` is the index — what each file gives you, when to
take it, a worked fifty-line game, and the mistakes worth not making. **Read it
before writing a 3D game.** It is short, and everything below is the summary of
why it exists rather than a replacement for it.

## What is in there

| File | For |
| --- | --- |
| \`engine.js\` | Renderer, camera, loop, resizing to the panel, context-loss recovery |
| \`materials.js\` | Palette, material factories, textures drawn in a canvas |
| \`lighting.js\` | Lighting rigs, shadows sized to the play area, blob shadows |
| \`models.js\` | Twenty low-poly models built from primitives, plus instancing |
| \`input.js\` | Keyboard, pointer, touch and gamepad merged into one polled snapshot |
| \`controls.js\` | Orbit, third-person, top-down, first-person and side-scroll camera rigs |
| \`hud.js\` | Score, bars, banners, toasts, title screen, on-screen touch controls |
| \`audio.js\` | Synthesised sound effects and music — no audio file to load |
| \`animation.js\` | Easing, tweens, springs, timelines, camera shake, GLTF clips |
| \`physics.js\` | Character controller with coyote time, overlap tests, spatial grid |
| \`particles.js\` | Pooled particle bursts and trails in one draw call |
| \`entities.js\` | Object pools, a safe entity list, spawners, waves |
| \`state.js\` | State machine, score with combos, countdown, difficulty curve |
| \`postfx.js\` | Tone-mapping presets, vignette, hit flash, optional bloom |

## They are source to paste, not a dependency to link

Nothing in \`engine/\` is reachable from the browser. The proxy fetches the
document and nothing else, so \`<script src="./engine/engine.js">\` is a 404 and
always will be.

- \`read_file\` the modules the game needs and paste their contents into the
  game's \`<script type="module">\`, above your own code.
- **Take a subset.** A game of pong wants \`engine.js\`, \`input.js\` and
  \`hud.js\`. Pasting all fourteen buries a small game in code it never calls.
- **Never paste the same file twice.** Two \`const PALETTE\` in one module is a
  \`SyntaxError\`, and a syntax error renders as a blank panel with the reason
  only in a console nobody is looking at.
- Nothing there imports or exports, and no two files declare the same name, so
  any subset in any order is valid. Keep \`materials.js\` above \`models.js\`,
  which needs it.
- Edit what you paste. It is the game's code now — retune a constant, delete a
  model the game does not use, rewrite a rig that does not fit.

## Loading Three.js

Pinned, from a CDN, through an import map:

\`\`\`html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js" } }
</script>
\`\`\`

then \`import * as THREE from "three"\` at the top of the module script.

- The import map has to come **before** the module that uses it, and a document
  may only have one.
- \`three.module.js\` fetches \`three.core.js\` from the same directory itself.
  Do not add an entry for it.
- For \`GLTFLoader\`, \`EffectComposer\` and the rest of \`three/addons\`, add
  \`"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.1/examples/jsm/"\`
  — trailing slash included, same version. Each addon is another file that can
  fail to load, so take them only when the game genuinely needs one.
- The CDN can be slow or down. Give the page something to look at that does not
  depend on the module having resolved; the seeded \`index.html\` shows the
  pattern with a CSS fallback behind a timer.

## Three.js facts that cost an hour each

- **Point and spot lights need large intensities.** Lights have been physically
  correct since r155 and there is no legacy mode to switch back to. A
  \`PointLight\` five units up with the default \`decay: 2\` needs an intensity
  near 25 to light anything, and renders black at 1. Directional, ambient and
  hemisphere lights take the small numbers you expect.
- **+Z is forward for a mesh.** \`Object3D.lookAt\` aims a mesh's +Z axis at its
  target, and everything in \`models.js\` is built facing +Z to match. A camera
  is the exception: it looks down -Z.
- **A custom \`ShaderMaterial\` must end its fragment shader with
  \`#include <tonemapping_fragment>\` and \`#include <colorspace_fragment>\`**, or
  it is the one object in the scene whose colours do not match the rest.
- **Pool anything that spawns repeatedly.** Geometries and materials hold GPU
  memory that garbage collection does not reclaim, so a bullet built per shot
  leaks until the tab dies.
- **Dispose a level before rebuilding it.** \`engine.js\` has \`disposeObject\`
  for exactly this.

## 3D is available, not compulsory

Three.js is the right call for a racer, a platformer, a shooter, a puzzle in
space. It is the wrong call for a card game, a word game, a grid puzzle or
anything played on a flat board — a 2D canvas is less code, sharper on text, and
has nothing to download. Pick the one the game actually wants; a tight 2D game
beats a 3D one that is mostly boilerplate.`,
}
