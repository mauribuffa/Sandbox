// ---------------------------------------------------------------------------
// animation.js — easing, tweens, springs, timelines, shake, and GLTF clips.
//
// Needs: THREE
// Gives you: Easing, damp, dampVec3, dampAngle, createTweens, Spring, Vec3Spring,
//            createTimeline, createShake, createMixer, spin, bob
//
// Almost all of what reads as "game feel" is here rather than in the physics: a
// pickup that scales up as it spawns, a camera that lags a turn, a menu that
// eases instead of cutting. None of it changes what the game does; all of it
// changes whether the game feels made.
// ---------------------------------------------------------------------------

const Easing = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicIn: (t) => t * t * t,
  cubicOut: (t) => --t * t * t + 1,
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  quartOut: (t) => 1 - --t * t * t * t,
  sineIn: (t) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  // Overshoots and settles — the difference between a button that appears and
  // a button that pops.
  backOut: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  elasticOut: (t) =>
    t === 0 || t === 1
      ? t
      : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1,
  bounceOut: (t) => {
    const n = 7.5625
    const d = 2.75
    if (t < 1 / d) return n * t * t
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
    return n * (t -= 2.625 / d) * t + 0.984375
  },
}

// Frame-rate-independent smoothing, and the single most useful function in this
// file. `lerp(a, b, 0.1)` in an update moves a tenth of the way per FRAME, so
// the same code is twice as fast on a 120Hz display as on a 60Hz one — which is
// why a camera tuned on one machine feels wrong on another. This moves a fixed
// fraction per SECOND. `lambda` is roughly "how many times faster than 1/e per
// second": 5 is loose, 15 is tight, 30 is nearly instant.
function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

function dampVec3(current, target, lambda, dt) {
  return current.lerp(target, 1 - Math.exp(-lambda * dt))
}

// Angles wrap, so damping 350° toward 10° the naive way spins the long way
// round. This takes the short arc.
function dampAngle(current, target, lambda, dt) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}

// A tween manager driven by the game's own delta, not by wall-clock time, so
// pausing the game pauses every animation with it and slow motion slows them.
function createTweens() {
  const active = []

  const manager = {
    // tweens.to(mesh.position, { y: 3 }, { duration: 0.4, easing: Easing.backOut })
    to(target, properties, options = {}) {
      const {
        duration = 0.3,
        easing = Easing.quadOut,
        delay = 0,
        onUpdate = null,
        onComplete = null,
      } = options

      const tween = {
        target,
        properties,
        from: null, // sampled when the delay elapses, not now
        duration,
        easing,
        delay,
        elapsed: 0,
        onUpdate,
        onComplete,
        done: false,
      }

      active.push(tween)
      return {
        tween,
        cancel: () => (tween.done = true),
        // Awaitable, for a cutscene or a sequence of menu transitions.
        promise: new Promise((resolve) => (tween.resolve = resolve)),
      }
    },

    update(dt) {
      for (let i = active.length - 1; i >= 0; i--) {
        const tween = active[i]

        if (tween.done) {
          active.splice(i, 1)
          continue
        }

        if (tween.delay > 0) {
          tween.delay -= dt
          continue
        }

        // Sampled late on purpose: a delayed tween should start from wherever
        // the object is when it fires, not from where it was when queued.
        if (!tween.from) {
          tween.from = {}
          for (const key of Object.keys(tween.properties)) tween.from[key] = tween.target[key]
        }

        tween.elapsed += dt
        const t = Math.min(1, tween.elapsed / tween.duration)
        const eased = tween.easing(t)

        for (const key of Object.keys(tween.properties)) {
          tween.target[key] =
            tween.from[key] + (tween.properties[key] - tween.from[key]) * eased
        }

        tween.onUpdate?.(eased, tween.target)

        if (t >= 1) {
          tween.onComplete?.(tween.target)
          tween.resolve?.()
          active.splice(i, 1)
        }
      }
    },

    // On a restart, every tween still running would otherwise keep writing to
    // objects the new game has replaced.
    clear() {
      active.length = 0
    },

    cancelFor(target) {
      for (const tween of active) if (tween.target === target) tween.done = true
    },
  }

  return manager
}

// A damped spring. Where a tween goes from A to B in a fixed time, a spring
// chases a target that can move — which is what you want for a health bar that
// is being drained while it catches up, or a UI element being dragged.
class Spring {
  constructor(stiffness = 120, damping = 16, value = 0) {
    this.stiffness = stiffness
    this.damping = damping
    this.value = value
    this.velocity = 0
    this.target = value
  }

  update(dt) {
    // Sub-stepped: a stiff spring integrated with a whole 1/30s frame overshoots
    // and then oscillates out to infinity. Capping the step keeps it stable.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const step = dt / steps

    for (let i = 0; i < steps; i++) {
      const force = -this.stiffness * (this.value - this.target)
      const drag = -this.damping * this.velocity
      this.velocity += (force + drag) * step
      this.value += this.velocity * step
    }

    return this.value
  }

  // Skip the travel — a respawn, not a movement.
  snap(value = this.target) {
    this.value = value
    this.target = value
    this.velocity = 0
  }
}

class Vec3Spring {
  constructor(stiffness = 120, damping = 16) {
    this.x = new Spring(stiffness, damping)
    this.y = new Spring(stiffness, damping)
    this.z = new Spring(stiffness, damping)
    this.value = new THREE.Vector3()
  }

  setTarget(vector) {
    this.x.target = vector.x
    this.y.target = vector.y
    this.z.target = vector.z
  }

  update(dt) {
    this.value.set(this.x.update(dt), this.y.update(dt), this.z.update(dt))
    return this.value
  }

  snap(vector) {
    this.x.snap(vector.x)
    this.y.snap(vector.y)
    this.z.snap(vector.z)
    this.value.copy(vector)
  }
}

// Things that happen in order, on the game clock: an intro, a wave pattern, a
// death sequence. `setTimeout` would keep running while the game is paused.
function createTimeline() {
  const steps = []
  let elapsed = 0
  let cursor = 0
  let running = false

  return {
    // .wait(0.5).then(() => hud.banner("GO")).wait(1).then(spawnWave)
    wait(seconds) {
      steps.push({ at: (steps.at(-1)?.at ?? 0) + seconds, run: null })
      return this
    },
    then(fn) {
      steps.push({ at: steps.at(-1)?.at ?? 0, run: fn })
      return this
    },
    start() {
      running = true
      elapsed = 0
      cursor = 0
      return this
    },
    stop() {
      running = false
      return this
    },
    update(dt) {
      if (!running) return
      elapsed += dt
      while (cursor < steps.length && steps[cursor].at <= elapsed) {
        steps[cursor].run?.()
        cursor++
      }
      if (cursor >= steps.length) running = false
    },
    get finished() {
      return !running && cursor >= steps.length
    },
  }
}

// Screen shake. Kept as an offset the game adds after the camera rig has run,
// rather than written into the camera directly — a rig that sets an absolute
// position every frame would overwrite a shake applied before it.
//
//   rig.update(dt)
//   shake.update(dt)
//   camera.position.add(shake.offset)
//   camera.rotation.z += shake.roll
function createShake() {
  let strength = 0
  let decay = 1
  const seed = Math.random() * 1000

  const shake = {
    offset: new THREE.Vector3(),
    roll: 0,

    // A bigger hit landing mid-shake takes over; a smaller one does not cut the
    // current shake short.
    trigger(amount = 0.4, duration = 0.35) {
      strength = Math.max(strength, amount)
      decay = amount / Math.max(0.01, duration)
    },

    update(dt, time = performance.now() / 1000) {
      if (strength <= 0) {
        shake.offset.set(0, 0, 0)
        shake.roll = 0
        return
      }

      strength = Math.max(0, strength - decay * dt)

      // Sine at mismatched frequencies rather than random(): noise resampled
      // every frame flickers, this reads as a physical rattle.
      const t = (time + seed) * 34
      shake.offset.set(
        Math.sin(t) * strength,
        Math.sin(t * 1.37 + 1.2) * strength,
        Math.sin(t * 0.91 + 2.4) * strength * 0.5
      )
      shake.roll = Math.sin(t * 1.13) * strength * 0.08
    },
  }

  return shake
}

// Wraps an AnimationMixer for the common case: a loaded GLTF with named clips,
// one playing at a time, crossfading between them.
//
//   const anim = createMixer(gltf.scene, gltf.animations)
//   anim.play("Run")            // fades out whatever was playing
//   engine.onUpdate(anim.update)
function createMixer(root, clips) {
  const mixer = new THREE.AnimationMixer(root)
  const actions = new Map()
  let current = null

  for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip))

  return {
    mixer,
    actions,
    get playing() {
      return current
    },

    play(name, { fade = 0.25, loop = THREE.LoopRepeat, timeScale = 1 } = {}) {
      const next = actions.get(name)
      if (!next || next === actions.get(current)) return null

      next.reset()
      next.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity)
      next.clampWhenFinished = loop === THREE.LoopOnce
      next.timeScale = timeScale
      next.fadeIn(fade).play()

      actions.get(current)?.fadeOut(fade)
      current = name
      return next
    },

    update: (dt) => mixer.update(dt),
    stop: () => mixer.stopAllAction(),
  }
}

// Behaviours small enough to be one-liners in an update loop, and common enough
// to be worth naming.
const spin = (object, speed = 1, axis = "y") => (dt) => (object.rotation[axis] += speed * dt)

const bob = (object, amplitude = 0.2, frequency = 2) => {
  const base = object.position.y
  return (dt, engine) => {
    object.position.y = base + Math.sin(engine.time * frequency) * amplitude
  }
}
