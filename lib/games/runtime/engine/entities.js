// ---------------------------------------------------------------------------
// entities.js — pools, a safe entity list, and spawning that ramps.
//
// Needs: THREE
// Gives you: createPool, createEntityList, createSpawner, createWaves
//
// The thing this exists to prevent: a game that builds a new Mesh for every
// bullet and lets the old one fall out of scope. Three.js objects hold GPU
// buffers that garbage collection does not free, so that pattern leaks video
// memory until the tab dies — and the collection pauses show up as stutter
// exactly when the screen is busiest.
//
// A pool builds N objects once and moves them between "in play" and "parked".
// ---------------------------------------------------------------------------

// factory() must return a fresh THREE.Object3D. It is called at most `max` times
// over the life of the game.
function createPool(factory, options = {}) {
  const {
    scene = null,
    initial = 0,
    max = 200,
    onAcquire = null, // (object) => void — reset it here
    onRelease = null,
  } = options

  const idle = []
  const active = new Set()
  let built = 0

  const build = () => {
    built++
    const object = factory()
    object.visible = false
    scene?.add(object)
    return object
  }

  for (let i = 0; i < initial; i++) idle.push(build())

  const pool = {
    active,
    get size() {
      return built
    },

    // Returns null at the ceiling rather than growing without bound: a spawner
    // with a bug should stall, not exhaust the machine.
    acquire() {
      const object = idle.pop() ?? (built < max ? build() : null)
      if (!object) return null

      object.visible = true
      active.add(object)
      onAcquire?.(object)
      return object
    },

    release(object) {
      if (!active.delete(object)) return
      object.visible = false
      onRelease?.(object)
      idle.push(object)
    },

    releaseAll() {
      for (const object of [...active]) pool.release(object)
    },

    // Snapshotted, so `release` inside the callback is safe.
    forEach(fn) {
      for (const object of [...active]) fn(object)
    },
  }

  return pool
}

// A list you can add to and remove from while iterating it. Doing that to a
// plain array — splicing inside the `for` loop that is walking it — silently
// skips the next element, which is the classic "every second enemy survives"
// bug.
function createEntityList() {
  const items = []
  const pendingAdd = []
  const pendingRemove = new Set()

  const list = {
    items,
    get length() {
      return items.length
    },

    add(entity) {
      pendingAdd.push(entity)
      return entity
    },

    remove(entity) {
      pendingRemove.add(entity)
    },

    // Structural changes are applied between frames, never mid-walk.
    flush() {
      if (pendingRemove.size) {
        for (let i = items.length - 1; i >= 0; i--) {
          if (pendingRemove.has(items[i])) items.splice(i, 1)
        }
        pendingRemove.clear()
      }
      if (pendingAdd.length) {
        items.push(...pendingAdd)
        pendingAdd.length = 0
      }
    },

    update(dt, fn) {
      list.flush()
      for (let i = 0; i < items.length; i++) fn(items[i], dt, i)
      list.flush()
    },

    clear() {
      items.length = 0
      pendingAdd.length = 0
      pendingRemove.clear()
    },
  }

  return list
}

// Spawns on an interval that tightens as the game goes on — the simplest
// difficulty curve there is, and for an arcade game usually the only one needed.
//
//   const spawner = createSpawner({ interval: 1.6, ramp: 0.97, spawn: () => addEnemy() })
//   engine.onUpdate((dt) => spawner.update(dt))
function createSpawner(options = {}) {
  const {
    interval = 1.5,
    minInterval = 0.35,
    // Multiplied into the interval after each spawn: 0.97 means every wave
    // arrives 3% sooner than the last.
    ramp = 0.98,
    spawn,
    startDelay = 0,
    limit = Infinity, // stop above this many live things
    count = () => 0,
  } = options

  let current = interval
  let cooldown = startDelay
  let spawned = 0

  const spawner = {
    running: true,
    get interval() {
      return current
    },
    get spawned() {
      return spawned
    },

    update(dt) {
      if (!spawner.running) return
      cooldown -= dt
      if (cooldown > 0) return

      cooldown = current
      if (count() >= limit) return

      spawn(spawned)
      spawned++
      current = Math.max(minInterval, current * ramp)
    },

    reset() {
      current = interval
      cooldown = startDelay
      spawned = 0
      spawner.running = true
    },
  }

  return spawner
}

// Discrete waves instead of a continuous drip: spawn a batch, wait for it to be
// cleared, pause, then send a bigger one. The structure that gives an arcade
// game a shape — a rhythm of pressure and relief — rather than a flat grind.
function createWaves(options = {}) {
  const {
    onWave, // (waveNumber, size) => void
    onCleared = null,
    remaining, // () => number still alive
    size = (wave) => 3 + wave * 2,
    breather = 2,
  } = options

  let wave = 0
  let waiting = 0
  let started = false

  return {
    get wave() {
      return wave
    },

    update(dt) {
      if (!started) {
        started = true
        wave++
        onWave(wave, size(wave))
        return
      }

      if (remaining() > 0) return

      // The pause after a wave is cleared is doing real work: it is where the
      // player registers that they won, and where the next wave lands as an
      // event rather than as more of the same.
      if (waiting === 0) onCleared?.(wave)
      waiting += dt

      if (waiting >= breather) {
        waiting = 0
        wave++
        onWave(wave, size(wave))
      }
    },

    reset() {
      wave = 0
      waiting = 0
      started = false
    },
  }
}
