// ---------------------------------------------------------------------------
// input.js — one polled snapshot of keyboard, pointer, touch and gamepad.
//
// Needs: THREE
// Gives you: createInput
//
// Polled, not event-driven, on purpose: a game loop wants to ask "is jump held
// right now" at a known point in the frame, not be interrupted whenever the OS
// felt like repeating a keydown.
//
// Two things about this runtime shape the design. Keyboard events only reach a
// frame that has focus, so the first pointer press takes focus explicitly.
// And the on-screen controls in hud.js feed the same virtual channels a gamepad
// does, so game code never has to ask which device it is being played on.
// ---------------------------------------------------------------------------

// Keys the browser would otherwise scroll or activate something with. Swallowing
// them is what stops the page lurching every time the player presses down.
const SWALLOWED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Tab",
])

function createInput(options = {}) {
  const { target = document.body, swallowKeys = true } = options

  const held = new Set()
  const pressedThisFrame = new Set()
  const releasedThisFrame = new Set()
  const actions = new Map()

  // What hud.js's thumbstick and buttons write into. Kept separate from the
  // real devices so releasing a touch button cannot clear a held key.
  const virtual = { x: 0, y: 0, buttons: new Set() }

  const input = {
    pointer: new THREE.Vector2(), // normalized device coords, -1..1, y up
    pointerPixels: new THREE.Vector2(), // relative to `target`, y down
    pointerDelta: new THREE.Vector2(),
    pointerDown: false,
    pointerPressed: false,
    pointerReleased: false,
    wheel: 0,
    touchCount: 0,
    gamepadConnected: false,

    down: (code) => held.has(code) || virtual.buttons.has(code),
    pressed: (code) => pressedThisFrame.has(code),
    released: (code) => releasedThisFrame.has(code),

    // Anything at all, for a "press any key to start" screen.
    anyPressed: () => pressedThisFrame.size > 0 || input.pointerPressed,

    // Name a control once, then ask for it by name. Rebinding later is a change
    // in one place instead of everywhere the key is tested.
    //   input.bind("jump", ["Space", "KeyW", "ArrowUp"])
    bind(name, codes) {
      actions.set(name, Array.isArray(codes) ? codes : [codes])
      return input
    },
    action: (name) => (actions.get(name) ?? []).some((code) => input.down(code)),
    actionPressed: (name) =>
      (actions.get(name) ?? []).some((code) => pressedThisFrame.has(code)),
    actionReleased: (name) =>
      (actions.get(name) ?? []).some((code) => releasedThisFrame.has(code)),

    // WASD, arrows, the left stick and the on-screen stick, merged and clamped
    // to a unit circle — so a diagonal is not 1.41x faster than a straight line.
    axis(out = new THREE.Vector2()) {
      let x = 0
      let y = 0

      if (input.down("KeyA") || input.down("ArrowLeft")) x -= 1
      if (input.down("KeyD") || input.down("ArrowRight")) x += 1
      if (input.down("KeyW") || input.down("ArrowUp")) y += 1
      if (input.down("KeyS") || input.down("ArrowDown")) y -= 1

      x += virtual.x
      y += virtual.y

      const pad = readGamepadAxes()
      if (pad) {
        x += pad.x
        y += pad.y
      }

      out.set(x, y)
      if (out.lengthSq() > 1) out.normalize()
      return out
    },

    // Written by hud.js's thumbstick. y is up-positive, matching `axis`.
    setVirtualAxis(x, y) {
      virtual.x = THREE.MathUtils.clamp(x, -1, 1)
      virtual.y = THREE.MathUtils.clamp(y, -1, 1)
    },

    // Written by hud.js's on-screen buttons, using real key codes so the same
    // `input.down("Space")` serves both a keyboard and a thumb.
    setVirtualButton(code, isDown) {
      const wasDown = virtual.buttons.has(code)
      if (isDown && !wasDown) {
        virtual.buttons.add(code)
        pressedThisFrame.add(code)
      } else if (!isDown && wasDown) {
        virtual.buttons.delete(code)
        releasedThisFrame.add(code)
      }
    },

    // Call this last in the update, after every system has read the frame.
    // Without it, `pressed` stays true forever and a single tap fires a jump
    // on every frame that follows.
    endFrame() {
      pressedThisFrame.clear()
      releasedThisFrame.clear()
      input.pointerPressed = false
      input.pointerReleased = false
      input.pointerDelta.set(0, 0)
      input.wheel = 0
    },

    dispose() {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      target.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
      target.removeEventListener("wheel", onWheel)
      target.removeEventListener("contextmenu", onContextMenu)
    },
  }

  function onKeyDown(event) {
    if (swallowKeys && SWALLOWED_KEYS.has(event.code)) event.preventDefault()
    // The OS repeats a held key. Only the first one is a press.
    if (event.repeat) return
    held.add(event.code)
    pressedThisFrame.add(event.code)
  }

  function onKeyUp(event) {
    held.delete(event.code)
    releasedThisFrame.add(event.code)
  }

  // A key held while the frame loses focus never sends its keyup, and the game
  // is left walking into a wall forever. Dropping everything on blur is the fix.
  function onBlur() {
    for (const code of held) releasedThisFrame.add(code)
    held.clear()
    virtual.buttons.clear()
    virtual.x = virtual.y = 0
    input.pointerDown = false
  }

  function updatePointer(event) {
    const rect = target.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }

    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const ndcX = (x / rect.width) * 2 - 1
    const ndcY = -(y / rect.height) * 2 + 1

    input.pointerDelta.set(ndcX - input.pointer.x, ndcY - input.pointer.y)
    input.pointer.set(ndcX, ndcY)
    input.pointerPixels.set(x, y)
  }

  function onPointerDown(event) {
    // Keyboard events go to the focused frame, and this page starts unfocused
    // inside its panel. The first press is the moment to claim focus, which is
    // why a game should always open with something to click.
    window.focus()

    updatePointer(event)
    input.pointerDown = true
    input.pointerPressed = true
    input.touchCount = event.pointerType === "touch" ? input.touchCount + 1 : 0
    target.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    updatePointer(event)
  }

  function onPointerUp(event) {
    updatePointer(event)
    input.pointerDown = false
    input.pointerReleased = true
    input.touchCount = Math.max(0, input.touchCount - 1)
    target.releasePointerCapture?.(event.pointerId)
  }

  function onWheel(event) {
    event.preventDefault()
    input.wheel += event.deltaY
  }

  function onContextMenu(event) {
    // Right-drag is a camera control in most 3D games, not a menu.
    event.preventDefault()
  }

  // The Gamepad API is gated by permissions policy, and a sandboxed frame does
  // not always get it. Feature-detected and wrapped, so a game that offers pad
  // support still runs where the pad is invisible.
  function readGamepadAxes() {
    if (typeof navigator.getGamepads !== "function") return null

    let pads
    try {
      pads = navigator.getGamepads()
    } catch {
      return null
    }

    for (const pad of pads) {
      if (!pad) continue
      input.gamepadConnected = true

      const deadzone = 0.15
      const x = Math.abs(pad.axes[0]) > deadzone ? pad.axes[0] : 0
      const y = Math.abs(pad.axes[1]) > deadzone ? -pad.axes[1] : 0

      // Face button / trigger presses arrive as the keys they stand in for.
      if (pad.buttons[0]?.pressed) virtual.buttons.add("Space")
      else virtual.buttons.delete("Space")

      if (x || y) return { x, y }
      return { x: 0, y: 0 }
    }

    return null
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", onBlur)
  target.addEventListener("pointerdown", onPointerDown)
  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("pointerup", onPointerUp)
  window.addEventListener("pointercancel", onPointerUp)
  target.addEventListener("wheel", onWheel, { passive: false })
  target.addEventListener("contextmenu", onContextMenu)

  return input
}
