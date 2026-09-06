// ---------------------------------------------------------------------------
// state.js — the state machine, the score, the clock.
//
// Needs: nothing
// Gives you: createStateMachine, createScore, createCountdown, createDifficulty
//
// A game with a menu, a playing state and a game-over screen written as loose
// booleans (`started`, `dead`, `paused`) has eight combinations, six of which
// are nonsense and at least one of which will happen. A state machine has three.
//
// One runtime fact shapes `createScore`: this page runs on an opaque origin,
// where `localStorage` does not merely fail to persist — reading it THROWS. The
// best score here lives in memory and dies with the frame, and that is the only
// option. Never write a game that promises a saved high score.
// ---------------------------------------------------------------------------

// states: { name: { enter?, update?, exit? } }
//
//   const game = createStateMachine({
//     menu:    { enter: () => title.show(), exit: () => title.hide() },
//     playing: { update: (dt) => stepWorld(dt) },
//     over:    { enter: () => gameOver.show() },
//   }, "menu")
function createStateMachine(states, initial) {
  let current = null
  let elapsed = 0

  const machine = {
    get state() {
      return current
    },
    // How long the current state has been running — most of what a state needs
    // to know about time is "how far into this am I", and this saves every
    // state keeping its own counter.
    get elapsed() {
      return elapsed
    },

    is: (name) => current === name,

    set(name, payload) {
      if (name === current) return machine
      if (!states[name]) throw new Error(`Unknown state: ${name}`)

      states[current]?.exit?.(name)
      const previous = current
      current = name
      elapsed = 0
      states[current].enter?.(payload, previous)
      return machine
    },

    update(dt) {
      elapsed += dt
      states[current]?.update?.(dt, machine)
      return machine
    },
  }

  machine.set(initial)
  return machine
}

// Score with a combo timer. The combo is the part worth having: a bare counter
// rewards playing at all, a multiplier that decays rewards playing well, and it
// costs a dozen lines.
function createScore(options = {}) {
  const {
    onChange = null,
    comboWindow = 2.5, // seconds before the streak lapses
    maxMultiplier = 8,
  } = options

  let value = 0
  let best = 0
  let combo = 0
  let sinceLast = Infinity

  const score = {
    get value() {
      return value
    },
    get best() {
      return best
    },
    get combo() {
      return combo
    },
    // Every 4 in a row is another times-one, capped.
    get multiplier() {
      return Math.min(maxMultiplier, 1 + Math.floor(combo / 4))
    },

    add(points, { combos = true } = {}) {
      if (combos) {
        combo = sinceLast <= comboWindow ? combo + 1 : 1
        sinceLast = 0
      }

      const gained = Math.round(points * score.multiplier)
      value += gained
      best = Math.max(best, value)
      onChange?.(value, gained, score)
      return gained
    },

    breakCombo() {
      combo = 0
      sinceLast = Infinity
    },

    update(dt) {
      sinceLast += dt
      if (combo > 0 && sinceLast > comboWindow) combo = 0
    },

    // `best` deliberately survives a reset: it is the only thing carrying over
    // between runs, since nothing can be written to disk.
    reset() {
      value = 0
      combo = 0
      sinceLast = Infinity
      onChange?.(value, 0, score)
    },
  }

  return score
}

function createCountdown(seconds, onEnd) {
  let remaining = seconds
  let running = false
  let fired = false

  const countdown = {
    get remaining() {
      return Math.max(0, remaining)
    },
    get running() {
      return running
    },
    // "1:05" — a raw float of seconds is not something to put on screen.
    get display() {
      const total = Math.max(0, Math.ceil(remaining))
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
    },

    start() {
      running = true
      return countdown
    },
    pause() {
      running = false
      return countdown
    },

    add(extra) {
      remaining += extra
    },

    update(dt) {
      if (!running) return
      remaining -= dt
      if (remaining <= 0 && !fired) {
        fired = true
        running = false
        onEnd?.()
      }
    },

    reset(to = seconds) {
      remaining = to
      fired = false
      running = false
      return countdown
    },
  }

  return countdown
}

// Difficulty as one number that rises with time, for everything else to read
// off. Keeping it in one place is what stops a game where the enemies got
// faster but the spawn rate did not, because they were tuned in two files.
//
//   difficulty.value  // 0 at the start, approaching 1
//   enemySpeed = 4 + difficulty.value * 6
function createDifficulty(options = {}) {
  const { rampSeconds = 120, curve = (t) => t } = options
  let elapsed = 0

  return {
    get value() {
      return curve(Math.min(1, elapsed / rampSeconds))
    },
    get seconds() {
      return elapsed
    },
    // Interpolate any tunable across the run in one call.
    between: (from, to) => from + (to - from) * curve(Math.min(1, elapsed / rampSeconds)),
    update(dt) {
      elapsed += dt
    },
    reset() {
      elapsed = 0
    },
  }
}
