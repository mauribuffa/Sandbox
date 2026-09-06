// ---------------------------------------------------------------------------
// audio.js — every sound synthesised, because no audio file can be loaded here.
//
// Needs: nothing (Web Audio API)
// Gives you: createAudio
//
// The runtime serves one HTML document and nothing beside it, so there is no
// .mp3 to fetch and a base64 sample would add hundreds of kilobytes to the page
// for one explosion. Web Audio generates all of it from oscillators and noise
// at a cost of nothing.
//
// Autoplay policy: an AudioContext created before the player interacts starts
// suspended and every sound played into it is silently dropped. `createAudio`
// therefore builds nothing up front and arms one-shot listeners that resume on
// the first press — so the HUD's start button doubles as the audio unlock.
// ---------------------------------------------------------------------------

function createAudio(options = {}) {
  const { volume = 0.35 } = options

  let ctx = null
  let master = null
  let musicHandle = null

  const audio = {
    muted: false,

    get context() {
      return ctx
    },

    // Safe to call from anywhere and as often as you like. The listeners below
    // call it too, so a game that never calls it explicitly still gets sound.
    unlock() {
      if (!ctx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) return null

        ctx = new AudioContextClass()
        master = ctx.createGain()
        master.gain.value = audio.muted ? 0 : volume
        master.connect(ctx.destination)
      }

      if (ctx.state === "suspended") ctx.resume()
      return ctx
    },

    setMuted(muted) {
      audio.muted = muted
      if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02)
    },

    setVolume(next) {
      if (master) master.gain.setTargetAtTime(next, ctx.currentTime, 0.02)
    },

    // One shaped oscillator note. Everything in `sfx` is built from this.
    //
    // The envelope is the whole trick: a raw oscillator switched on and off
    // clicks, because the waveform jumps from silence to full amplitude in one
    // sample. Ramping the gain in and out is what turns a click into a note.
    tone({
      freq = 440,
      type = "square",
      duration = 0.16,
      gain = 0.6,
      attack = 0.004,
      release = 0.08,
      slideTo = null,
      detune = 0,
      delay = 0,
    } = {}) {
      if (!audio.unlock() || audio.muted) return

      const start = ctx.currentTime + delay
      const oscillator = ctx.createOscillator()
      const envelope = ctx.createGain()

      oscillator.type = type
      oscillator.detune.value = detune
      oscillator.frequency.setValueAtTime(freq, start)
      if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), start + duration)

      // Exponential ramps are undefined through zero — passing a gain of 0
      // throws rather than playing silence — so both ends are floored.
      const peak = Math.max(0.0001, gain)
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(peak, start + attack)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration + release)

      oscillator.connect(envelope).connect(master)
      oscillator.start(start)
      oscillator.stop(start + duration + release + 0.02)
    },

    // Filtered white noise — impacts, footsteps, wind, explosions.
    noise({
      duration = 0.25,
      gain = 0.5,
      type = "lowpass",
      frequency = 1200,
      sweepTo = null,
      Q = 1,
      delay = 0,
    } = {}) {
      if (!audio.unlock() || audio.muted) return

      const start = ctx.currentTime + delay
      const frames = Math.max(1, Math.floor(ctx.sampleRate * duration))
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
      const channel = buffer.getChannelData(0)
      for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1

      const source = ctx.createBufferSource()
      source.buffer = buffer

      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.Q.value = Q
      filter.frequency.setValueAtTime(frequency, start)
      if (sweepTo) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), start + duration)
      }

      const envelope = ctx.createGain()
      envelope.gain.setValueAtTime(Math.max(0.0001, gain), start)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      source.connect(filter).connect(envelope).connect(master)
      source.start(start)
      source.stop(start + duration + 0.02)
    },

    chord(freqs, options = {}) {
      freqs.forEach((freq, index) =>
        audio.tone({ freq, gain: 0.35, ...options, delay: (options.delay ?? 0) + index * (options.strum ?? 0) })
      )
    },

    // A named set that covers most of what a game needs to say out loud.
    sfx: {
      blip: () => audio.tone({ freq: 880, type: "square", duration: 0.05, gain: 0.28 }),
      select: () => audio.tone({ freq: 520, slideTo: 780, type: "triangle", duration: 0.1, gain: 0.35 }),
      jump: () => audio.tone({ freq: 260, slideTo: 660, type: "square", duration: 0.14, gain: 0.32 }),
      land: () => audio.noise({ duration: 0.1, frequency: 500, sweepTo: 120, gain: 0.3 }),
      step: () => audio.noise({ duration: 0.05, frequency: 900, gain: 0.12 }),
      coin: () => {
        audio.tone({ freq: 988, type: "square", duration: 0.06, gain: 0.3 })
        audio.tone({ freq: 1319, type: "square", duration: 0.12, gain: 0.28, delay: 0.06 })
      },
      powerup: () => {
        // A rising arpeggio reads as "good" almost universally.
        ;[523, 659, 784, 1047].forEach((freq, i) =>
          audio.tone({ freq, type: "triangle", duration: 0.09, gain: 0.3, delay: i * 0.06 })
        )
      },
      hit: () => {
        audio.tone({ freq: 180, slideTo: 60, type: "sawtooth", duration: 0.14, gain: 0.4 })
        audio.noise({ duration: 0.12, frequency: 2000, sweepTo: 200, gain: 0.35 })
      },
      laser: () => audio.tone({ freq: 1400, slideTo: 220, type: "sawtooth", duration: 0.16, gain: 0.26 }),
      thud: () => audio.tone({ freq: 90, slideTo: 40, type: "sine", duration: 0.2, gain: 0.6 }),
      explode: () => {
        audio.noise({ duration: 0.7, frequency: 1600, sweepTo: 60, gain: 0.6, Q: 0.8 })
        audio.tone({ freq: 70, slideTo: 25, type: "sine", duration: 0.5, gain: 0.5 })
      },
      lose: () => {
        ;[440, 349, 262].forEach((freq, i) =>
          audio.tone({ freq, type: "triangle", duration: 0.24, gain: 0.32, delay: i * 0.16 })
        )
      },
      win: () => {
        ;[523, 659, 784, 1047, 1319].forEach((freq, i) =>
          audio.tone({ freq, type: "square", duration: 0.14, gain: 0.28, delay: i * 0.1 })
        )
      },
    },

    // A looping backing track built from a scale rather than a file.
    //
    // Notes are scheduled ahead of the clock rather than fired from a timer:
    // `setInterval` drifts by whole frames under load, which a listener hears
    // immediately as a stumbling beat. This queues each note against the audio
    // clock, which does not drift.
    music({
      bpm = 108,
      root = 196, // G3
      scale = [0, 3, 5, 7, 10], // minor pentatonic — hard to make sound wrong
      steps = 16,
      gain = 0.16,
      bass = true,
      type = "triangle",
    } = {}) {
      audio.stopMusic()
      if (!audio.unlock()) return null

      const stepDuration = 60 / bpm / 2 // eighth notes
      const lookahead = 0.25
      let step = 0
      let nextTime = ctx.currentTime + 0.1

      const semitone = (n) => root * Math.pow(2, n / 12)

      const schedule = () => {
        while (nextTime < ctx.currentTime + lookahead) {
          const delay = nextTime - ctx.currentTime
          const degree = scale[(step * 3) % scale.length]
          const octave = step % 8 < 4 ? 0 : 12

          audio.tone({
            freq: semitone(degree + octave + 12),
            type,
            duration: stepDuration * 0.7,
            gain,
            delay,
          })

          if (bass && step % 4 === 0) {
            audio.tone({
              freq: semitone(scale[(step / 4) % scale.length]) / 2,
              type: "sine",
              duration: stepDuration * 1.6,
              gain: gain * 1.4,
              delay,
            })
          }

          step = (step + 1) % steps
          nextTime += stepDuration
        }
      }

      schedule()
      const timer = setInterval(schedule, 25)
      musicHandle = { stop: () => clearInterval(timer) }
      return musicHandle
    },

    stopMusic() {
      musicHandle?.stop()
      musicHandle = null
    },

    dispose() {
      audio.stopMusic()
      window.removeEventListener("pointerdown", onGesture)
      window.removeEventListener("keydown", onGesture)
      ctx?.close()
      ctx = null
    },
  }

  function onGesture() {
    audio.unlock()
  }

  // `once` on both: after the first gesture the context stays resumed for the
  // life of the page, and leaving live listeners on window would cost a call on
  // every keystroke of play.
  window.addEventListener("pointerdown", onGesture, { once: true })
  window.addEventListener("keydown", onGesture, { once: true })

  return audio
}
