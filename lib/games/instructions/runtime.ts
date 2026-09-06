import type { SystemModelMessage } from "ai"

import { GAME_DIR, GAME_PORT } from "@/lib/daytona/utils"

// What the game actually runs on. Every constraint below falls out of how the
// sandbox is served and framed — `startGameServer` in lib/daytona/utils.ts, the
// proxy in app/api/games/[id]/preview/route.ts and the iframe in
// components/chat-preview.tsx — rather than being a matter of taste, so a game
// that ignores one of them renders as an empty panel.
export const runtimeInstructions: SystemModelMessage = {
  role: "system",
  content: `# Runtime

The game lives in a Daytona sandbox — a Linux container of its own, created on
this conversation's first turn and kept for the life of the game. Files written
there stay there: a later turn opens the game exactly as the last turn left it.

## The game directory

- \`${GAME_DIR}\` holds the game, and \`${GAME_DIR}/index.html\` is the game. It
  starts as a placeholder, and the first build replaces it.
- \`${GAME_DIR}/engine/\` holds a Three.js primitives library, seeded there
  before the first turn. It is source to read and paste into the game rather
  than files the page can load — see the engine instructions.
- That directory is served by \`python3 -m http.server\` on port ${GAME_PORT}: a
  static file server and nothing more. No Node process, no build step, no
  bundler, no \`npm install\`. Only what a browser runs as-is will ever run.

## index.html has to be self-contained

The player reaches the game through a proxy that fetches the document alone, so
nothing else in the directory is reachable from the page — \`./game.js\`,
\`styles.css\`, \`assets/sprite.png\` and \`./engine/engine.js\` all 404. Files
sitting in the directory are not an exception to this; they are readable by your
tools and invisible to the browser.

- Keep the CSS in a \`<style>\` tag and the JavaScript in a \`<script>\` tag, in
  that same file.
- Draw art with canvas, SVG, CSS or emoji, or inline it as a \`data:\` URI. There
  is no other way to ship an image.
- A third-party library works only as an absolute \`https://\` CDN URL pinned to
  an exact version. Prefer going without one: it is a load that can fail.

## The frame it runs in

The page is framed with \`sandbox="allow-scripts"\`, which puts it on an opaque
origin.

- \`localStorage\`, \`sessionStorage\`, cookies and IndexedDB are unavailable and
  throw on access. Hold all state in memory; a reload starts a fresh game and no
  high score survives it.
- Popups, top-level navigation and form submission are blocked. Never send the
  player off the page.
- Pointer Lock is refused: the frame is not granted \`allow-pointer-lock\`. A
  mouselook game has to use drag-to-look, and must never promise otherwise. The
  Fullscreen API is refused for the same reason — the panel is the whole screen
  the game gets.
- What a game needs does work: canvas 2D and WebGL, Web Audio,
  \`requestAnimationFrame\`, and pointer, keyboard and touch input. The Gamepad
  API is gated by permissions policy and may be missing here, so feature-detect
  it and let the game play without one.
- Audio stays autoplay-blocked until the player interacts, so create or resume
  the \`AudioContext\` on the first click or keypress rather than on load.
- Keyboard events only reach a frame that has focus. Give the player something
  to click to begin, and listen on \`window\` from inside the page.

## WebGL

- The browser can take the GPU context away under memory pressure and hand a new
  one back. Call \`preventDefault()\` on \`webglcontextlost\` — without it the
  canvas stays black for good rather than recovering.
- Cap the device pixel ratio at 2. Rendering a small panel at 3x costs nine
  times the pixels for a difference nobody can see.

## The panel it fills

The preview sits in a panel the user can drag wider or narrower, so there is no
window size to count on. Size the canvas off the viewport, re-layout on
\`resize\`, and keep the whole playfield visible in a tall narrow panel as well
as a short wide one. A fixed pixel layout gets cropped.`,
}
