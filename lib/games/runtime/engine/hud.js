// ---------------------------------------------------------------------------
// hud.js — score, bars, banners, menus and touch controls, as DOM over the canvas.
//
// Needs: nothing (plain DOM). Pass `input` from input.js to wire touch controls.
// Gives you: createHUD
//
// The HUD is HTML rather than sprites in the scene because HTML already knows
// how to lay out text at any panel size, stays crisp at any pixel ratio, and
// costs no draw calls. The layer sits over the canvas with `pointer-events:
// none`, so only the pieces that are meant to be pressed take input.
//
// Sizes are in `clamp()` and `svmin` throughout: the preview panel is dragged
// from phone-narrow to wide, and a HUD in fixed pixels either swamps the small
// end or disappears at the large one.
// ---------------------------------------------------------------------------

const HUD_STYLES = `
.hud-layer {
  position: fixed; inset: 0; pointer-events: none; z-index: 10;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #ffe3d0;
  -webkit-user-select: none; user-select: none;
  --hud-brand: #ea580c;
  --hud-cream: #ffe3d0;
  --hud-ink: rgba(11, 13, 18, 0.72);
}
.hud-corner {
  position: absolute; display: flex; flex-direction: column; gap: 0.5rem;
  padding: clamp(0.6rem, 2.5vmin, 1.25rem); max-width: 60%;
}
.hud-corner[data-corner="top-left"] { top: 0; left: 0; align-items: flex-start; }
.hud-corner[data-corner="top-right"] { top: 0; right: 0; align-items: flex-end; }
.hud-corner[data-corner="bottom-left"] { bottom: 0; left: 0; align-items: flex-start; }
.hud-corner[data-corner="bottom-right"] { bottom: 0; right: 0; align-items: flex-end; }
.hud-corner[data-corner="top-center"] { top: 0; left: 50%; transform: translateX(-50%); align-items: center; }
.hud-corner[data-corner="bottom-center"] { bottom: 0; left: 50%; transform: translateX(-50%); align-items: center; }

.hud-readout {
  display: flex; align-items: baseline; gap: 0.5em;
  padding: 0.35em 0.7em; border-radius: 0.6em;
  background: var(--hud-ink);
  backdrop-filter: blur(6px);
  box-shadow: inset 0 0 0 1px rgba(255, 227, 208, 0.14);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.hud-readout-label {
  font-size: clamp(0.6rem, 1.6vmin, 0.78rem); letter-spacing: 0.09em;
  text-transform: uppercase; opacity: 0.66; font-weight: 600;
}
.hud-readout-value { font-size: clamp(1rem, 3.4vmin, 1.6rem); font-weight: 700; line-height: 1; }

.hud-bar { width: clamp(7rem, 28vmin, 13rem); }
.hud-bar-label {
  font-size: clamp(0.58rem, 1.5vmin, 0.72rem); letter-spacing: 0.09em;
  text-transform: uppercase; opacity: 0.66; font-weight: 600; margin-bottom: 0.3em;
}
.hud-bar-track {
  height: clamp(0.5rem, 1.6vmin, 0.7rem); border-radius: 999px; overflow: hidden;
  background: var(--hud-ink);
  box-shadow: inset 0 0 0 1px rgba(255, 227, 208, 0.16);
}
.hud-bar-fill {
  height: 100%; width: 100%; border-radius: 999px;
  background: var(--hud-brand);
  transform-origin: left center;
  transition: transform 140ms ease-out, background-color 200ms ease-out;
}

.hud-banner {
  position: absolute; top: 26%; left: 50%; transform: translate(-50%, -50%);
  font-size: clamp(1.6rem, 8vmin, 4rem); font-weight: 800; letter-spacing: -0.02em;
  text-shadow: 0 0.1em 0.4em rgba(11, 13, 18, 0.8);
  opacity: 0; transition: opacity 180ms ease-out, transform 180ms ease-out;
  text-align: center; white-space: nowrap;
}
.hud-banner[data-visible="true"] { opacity: 1; transform: translate(-50%, -60%); }

.hud-toasts {
  position: absolute; top: 42%; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
}
.hud-toast {
  font-size: clamp(0.9rem, 3vmin, 1.4rem); font-weight: 700;
  text-shadow: 0 0.1em 0.3em rgba(11, 13, 18, 0.9);
  animation: hud-rise 900ms ease-out forwards;
}
@keyframes hud-rise {
  from { opacity: 0; transform: translateY(0.6em) scale(0.9); }
  25%  { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(-1.6em) scale(1); }
}

.hud-hint {
  display: flex; flex-wrap: wrap; gap: 0.35rem 0.6rem;
  font-size: clamp(0.62rem, 1.7vmin, 0.8rem); opacity: 0.8;
}
.hud-hint span {
  padding: 0.2em 0.55em; border-radius: 0.45em; background: var(--hud-ink);
  box-shadow: inset 0 0 0 1px rgba(255, 227, 208, 0.12);
}

.hud-crosshair {
  position: absolute; top: 50%; left: 50%; width: 1.1rem; height: 1.1rem;
  transform: translate(-50%, -50%); opacity: 0.7;
}
.hud-crosshair::before, .hud-crosshair::after {
  content: ""; position: absolute; background: var(--hud-cream);
}
.hud-crosshair::before { left: 50%; top: 0; width: 1px; height: 100%; transform: translateX(-50%); }
.hud-crosshair::after { top: 50%; left: 0; height: 1px; width: 100%; transform: translateY(-50%); }

.hud-screen {
  position: absolute; inset: 0; pointer-events: auto;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(0.6rem, 2vmin, 1rem); text-align: center;
  padding: clamp(1rem, 5vmin, 3rem);
  background: radial-gradient(120% 100% at 50% 0%, rgba(234, 88, 12, 0.16), rgba(11, 13, 18, 0.92));
  backdrop-filter: blur(3px);
}
.hud-screen[hidden] { display: none; }
.hud-screen-title {
  font-size: clamp(1.6rem, 7vmin, 3.4rem); font-weight: 800;
  letter-spacing: -0.025em; line-height: 1.05; margin: 0;
}
.hud-screen-body {
  font-size: clamp(0.8rem, 2.4vmin, 1.05rem); opacity: 0.8;
  max-width: 34ch; line-height: 1.5; margin: 0;
}
.hud-screen-action {
  pointer-events: auto; cursor: pointer; border: 0;
  margin-top: 0.5rem; padding: 0.65em 1.6em; border-radius: 999px;
  font: inherit; font-size: clamp(0.85rem, 2.6vmin, 1.1rem); font-weight: 700;
  color: #1a0b02; background: var(--hud-brand);
  box-shadow: 0 0.4em 1.4em rgba(234, 88, 12, 0.42);
  transition: transform 120ms ease-out, filter 120ms ease-out;
}
.hud-screen-action:hover { filter: brightness(1.08); transform: translateY(-1px); }
.hud-screen-action:active { transform: translateY(1px); }

.hud-touch { position: absolute; inset: 0; pointer-events: none; }
.hud-stick {
  position: absolute; bottom: 8%; left: 6%;
  width: clamp(6rem, 26vmin, 9rem); aspect-ratio: 1; border-radius: 50%;
  background: rgba(11, 13, 18, 0.45);
  box-shadow: inset 0 0 0 2px rgba(255, 227, 208, 0.22);
  pointer-events: auto; touch-action: none;
}
.hud-stick-knob {
  position: absolute; top: 50%; left: 50%; width: 42%; aspect-ratio: 1;
  border-radius: 50%; background: var(--hud-cream); opacity: 0.85;
  transform: translate(-50%, -50%);
}
.hud-touch-buttons {
  position: absolute; bottom: 8%; right: 6%;
  display: flex; gap: 0.7rem; align-items: flex-end;
}
.hud-touch-button {
  pointer-events: auto; touch-action: none; cursor: pointer; border: 0;
  width: clamp(3.6rem, 15vmin, 5rem); aspect-ratio: 1; border-radius: 50%;
  font: inherit; font-weight: 800; font-size: clamp(0.65rem, 2vmin, 0.85rem);
  letter-spacing: 0.04em; color: #1a0b02; background: var(--hud-brand);
  box-shadow: 0 0.3em 1rem rgba(234, 88, 12, 0.4);
}
.hud-touch-button:active { filter: brightness(1.15); transform: scale(0.94); }
`

function createHUD(options = {}) {
  const { container = document.body, input = null } = options

  if (!document.getElementById("hud-styles")) {
    const style = document.createElement("style")
    style.id = "hud-styles"
    style.textContent = HUD_STYLES
    document.head.appendChild(style)
  }

  const layer = document.createElement("div")
  layer.className = "hud-layer"
  container.appendChild(layer)

  const corners = new Map()
  const banners = []

  function corner(name) {
    let element = corners.get(name)
    if (!element) {
      element = document.createElement("div")
      element.className = "hud-corner"
      element.dataset.corner = name
      layer.appendChild(element)
      corners.set(name, element)
    }
    return element
  }

  const hud = {
    layer,

    // A labelled number: score, lives, wave, time left.
    readout({ label = "", value = 0, corner: where = "top-left", format = String } = {}) {
      const root = document.createElement("div")
      root.className = "hud-readout"
      root.innerHTML =
        `<span class="hud-readout-label"></span><span class="hud-readout-value"></span>`

      const labelNode = root.firstChild
      const valueNode = root.lastChild
      labelNode.textContent = label
      // Hidden rather than removed: a readout created without a label can still
      // be given one later with `setLabel`.
      labelNode.hidden = !label
      valueNode.textContent = format(value)
      corner(where).appendChild(root)

      return {
        element: root,
        set(next) {
          valueNode.textContent = format(next)
        },
        setLabel(next) {
          labelNode.textContent = next
          labelNode.hidden = !next
        },
        remove: () => root.remove(),
      }
    },

    // A 0..1 meter: health, fuel, charge, a boss's remaining hit points.
    bar({ label = "", value = 1, color = "#ea580c", corner: where = "top-left", lowColor = null } = {}) {
      const root = document.createElement("div")
      root.className = "hud-bar"
      root.innerHTML =
        `<div class="hud-bar-label"></div><div class="hud-bar-track"><div class="hud-bar-fill"></div></div>`

      const labelNode = root.firstChild
      const fill = root.lastChild.firstChild
      labelNode.textContent = label
      labelNode.hidden = !label
      fill.style.backgroundColor = color
      corner(where).appendChild(root)

      const set = (next) => {
        const clamped = Math.max(0, Math.min(1, next))
        // Scaled rather than resized: a transform is composited on the GPU and
        // does not re-layout the page every time the player takes a hit.
        fill.style.transform = `scaleX(${clamped})`
        if (lowColor) fill.style.backgroundColor = clamped < 0.3 ? lowColor : color
      }

      set(value)
      return { element: root, set, remove: () => root.remove() }
    },

    // Big centred text that fades itself out: "Wave 3", "GO!", "Game Over".
    banner(text, { duration = 1.2 } = {}) {
      const node = document.createElement("div")
      node.className = "hud-banner"
      node.textContent = text
      layer.appendChild(node)
      banners.push(node)

      requestAnimationFrame(() => (node.dataset.visible = "true"))
      setTimeout(() => {
        node.dataset.visible = "false"
        setTimeout(() => node.remove(), 240)
      }, duration * 1000)

      return node
    },

    // A small number that floats up and vanishes: "+50", "-1 life", "COMBO x3".
    toast(text, { color = "#ffe3d0" } = {}) {
      let stack = layer.querySelector(".hud-toasts")
      if (!stack) {
        stack = document.createElement("div")
        stack.className = "hud-toasts"
        layer.appendChild(stack)
      }

      const node = document.createElement("div")
      node.className = "hud-toast"
      node.style.color = color
      node.textContent = text
      stack.appendChild(node)
      setTimeout(() => node.remove(), 950)
      return node
    },

    // The control legend. The player has no manual and cannot be told the keys
    // anywhere else, so every game should call this.
    hint(lines, { corner: where = "bottom-left" } = {}) {
      const root = document.createElement("div")
      root.className = "hud-hint"
      for (const line of lines) {
        const span = document.createElement("span")
        span.textContent = line
        root.appendChild(span)
      }
      corner(where).appendChild(root)
      return { element: root, remove: () => root.remove() }
    },

    crosshair() {
      const node = document.createElement("div")
      node.className = "hud-crosshair"
      layer.appendChild(node)
      return { element: node, remove: () => node.remove() }
    },

    // A full-panel title / pause / game-over screen with one button.
    //
    // The button matters more than it looks: its click is what gives the frame
    // keyboard focus and what unlocks the AudioContext. Open every game with
    // one of these rather than starting play on load.
    screen({ title = "", body = "", action = "Start", onAction = null } = {}) {
      const root = document.createElement("div")
      root.className = "hud-screen"
      root.innerHTML =
        `<h1 class="hud-screen-title"></h1>` +
        `<p class="hud-screen-body"></p>` +
        `<button class="hud-screen-action" type="button"></button>`

      const [titleNode, bodyNode, button] = root.children
      const api = {
        element: root,
        update({ title: t, body: b, action: a } = {}) {
          if (t !== undefined) titleNode.textContent = t
          if (b !== undefined) {
            bodyNode.textContent = b
            bodyNode.hidden = !b
          }
          if (a !== undefined) {
            button.textContent = a
            button.hidden = !a
          }
          return api
        },
        show: () => ((root.hidden = false), api),
        hide: () => ((root.hidden = true), api),
        onAction(handler) {
          api._handler = handler
          return api
        },
        remove: () => root.remove(),
      }

      api.update({ title, body, action })
      api._handler = onAction
      button.addEventListener("click", () => {
        window.focus()
        api._handler?.(api)
      })

      layer.appendChild(root)
      return api
    },

    // Thumbstick and action buttons, wired straight into input.js. Shown only
    // where the pointer is coarse, so a desktop player never sees them.
    touchControls({
      stick = true,
      buttons = [{ label: "JUMP", code: "Space" }],
      force = false,
    } = {}) {
      const coarse =
        force ||
        (window.matchMedia?.("(pointer: coarse)").matches ?? false) ||
        navigator.maxTouchPoints > 0

      if (!coarse || !input) return { element: null, remove: () => {} }

      const root = document.createElement("div")
      root.className = "hud-touch"
      layer.appendChild(root)

      if (stick) {
        const pad = document.createElement("div")
        pad.className = "hud-stick"
        pad.innerHTML = `<div class="hud-stick-knob"></div>`
        const knob = pad.firstChild
        root.appendChild(pad)

        let activeId = null

        const move = (event) => {
          if (activeId !== event.pointerId) return
          const rect = pad.getBoundingClientRect()
          const radius = rect.width / 2
          let dx = (event.clientX - (rect.left + radius)) / radius
          let dy = (event.clientY - (rect.top + radius)) / radius

          const length = Math.hypot(dx, dy)
          if (length > 1) {
            dx /= length
            dy /= length
          }

          knob.style.transform = `translate(calc(-50% + ${dx * radius * 0.6}px), calc(-50% + ${dy * radius * 0.6}px))`
          // Screen y grows downward; the game's forward axis grows upward.
          input.setVirtualAxis(dx, -dy)
        }

        pad.addEventListener("pointerdown", (event) => {
          activeId = event.pointerId
          pad.setPointerCapture(event.pointerId)
          move(event)
        })
        pad.addEventListener("pointermove", move)

        const release = (event) => {
          if (activeId !== event.pointerId) return
          activeId = null
          knob.style.transform = "translate(-50%, -50%)"
          input.setVirtualAxis(0, 0)
        }
        pad.addEventListener("pointerup", release)
        pad.addEventListener("pointercancel", release)
      }

      if (buttons.length) {
        const group = document.createElement("div")
        group.className = "hud-touch-buttons"
        root.appendChild(group)

        for (const { label, code } of buttons) {
          const button = document.createElement("button")
          button.className = "hud-touch-button"
          button.type = "button"
          button.textContent = label
          group.appendChild(button)

          button.addEventListener("pointerdown", (event) => {
            event.preventDefault()
            window.focus()
            button.setPointerCapture(event.pointerId)
            input.setVirtualButton(code, true)
          })

          const release = () => input.setVirtualButton(code, false)
          button.addEventListener("pointerup", release)
          button.addEventListener("pointercancel", release)
        }
      }

      return { element: root, remove: () => root.remove() }
    },

    dispose() {
      for (const banner of banners) banner.remove()
      layer.remove()
    },
  }

  return hud
}
