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
- That directory is served by \`python3 -m http.server\` on port ${GAME_PORT}: a
  static file server and nothing more. No Node process, no build step, no
  bundler, no \`npm install\`. Only what a browser runs as-is will ever run.

## index.html has to be self-contained

The player reaches the game through a proxy that fetches the document alone, so
nothing else in the directory is reachable from the page — \`./game.js\`,
\`styles.css\` and \`assets/sprite.png\` all 404.

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
- What a game needs does work: canvas 2D and WebGL, Web Audio,
  \`requestAnimationFrame\`, and pointer, keyboard, touch and gamepad input.
- Audio stays autoplay-blocked until the player interacts, so create or resume
  the \`AudioContext\` on the first click or keypress rather than on load.
- Keyboard events only reach a frame that has focus. Give the player something
  to click to begin, and listen on \`window\` from inside the page.

## The panel it fills

The preview sits in a panel the user can drag wider or narrower, so there is no
window size to count on. Size the canvas off the viewport, re-layout on
\`resize\`, and keep the whole playfield visible in a tall narrow panel as well
as a short wide one. A fixed pixel layout gets cropped.`,
}
