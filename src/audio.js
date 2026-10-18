// RIFTSYNC audio. All sound is synthesised locally with the Web Audio API, so
// there are no audio files to download and no autoplay issues: nothing plays
// until the first user gesture (PLAY RUN) resumes the context.

const AMBIENCE = [
  { base: 46, detune: 0.6, filter: 320, type: 'sawtooth', gain: 0.05 },   // THE GRID  — low electrical hum
  { base: 62, detune: 1.5, filter: 520, type: 'triangle', gain: 0.05 },   // THE DOJO  — airy wind tone
  { base: 38, detune: 0.3, filter: 220, type: 'sawtooth', gain: 0.07 },   // THE FORGE — heavy machinery
  { base: 55, detune: 4.0, filter: 900, type: 'sine', gain: 0.04 }        // THE VOID  — vast, shimmering
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let ambience = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch { ctx = null; }
    return ctx;
  }

  function env(node, when, attack, release, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + release);
    node.connect(g);
    g.connect(master);
    return g;
  }

  function tone({ freq = 440, end, dur = 0.2, type = 'sine', vol = 0.15, attack = 0.005, dest = null }) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + dur);
    const owner = dest || master;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(owner);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  function noise({ dur = 0.12, vol = 0.2, freq = 1200, q = 1, type = 'bandpass' }) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(now);
    src.stop(now + dur);
  }

  function ambient(index) {
    if (!ensure() || muted) return;
    stopAmbient();
    const cfg = AMBIENCE[index] || AMBIENCE[0];
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(cfg.gain, now + 1.6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.filter;
    filter.connect(g);
    g.connect(master);
    const oscs = [];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = cfg.type;
      o.frequency.value = cfg.base * (1 + i * 0.5 + (i ? cfg.detune * 0.01 : 0));
      o.detune.value = (i - 1) * cfg.detune * 8;
      o.connect(filter);
      o.start(now);
      oscs.push(o);
    }
    // slow shimmer
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08 + index * 0.02;
    lfoGain.gain.value = cfg.filter * 0.3;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(now);
    oscs.push(lfo);
    ambience = { oscs, g };
  }

  function stopAmbient() {
    if (!ambience || !ctx) return;
    const now = ctx.currentTime;
    try {
      ambience.g.gain.cancelScheduledValues(now);
      ambience.g.gain.setValueAtTime(ambience.g.gain.value, now);
      ambience.g.gain.linearRampToValueAtTime(0.0001, now + 0.6);
      ambience.oscs.forEach(o => o.stop(now + 0.7));
    } catch { /* already stopped */ }
    ambience = null;
  }

  return {
    resume() { ensure(); },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    setMuted(v) {
      muted = v;
      if (master) master.gain.value = v ? 0 : 0.9;
      if (v) stopAmbient();
    },
    ambient, stopAmbient,
    footstep(stepAlt) {
      noise({ dur: 0.09, vol: 0.14, freq: stepAlt ? 900 : 700, q: 0.8 });
      tone({ freq: stepAlt ? 150 : 120, end: 70, dur: 0.09, type: 'triangle', vol: 0.05 });
    },
    jump() { tone({ freq: 300, end: 620, dur: 0.22, type: 'triangle', vol: 0.11 }); },
    land() { noise({ dur: 0.16, vol: 0.22, freq: 420, q: 0.7 }); tone({ freq: 130, end: 60, dur: 0.18, type: 'sine', vol: 0.14 }); },
    slide() { noise({ dur: 0.5, vol: 0.14, freq: 2400, q: 0.6, type: 'highpass' }); },
    collect(combo = 0) {
      const f = 620 + Math.min(combo, 8) * 46;
      tone({ freq: f, dur: 0.14, type: 'sine', vol: 0.09 });
      tone({ freq: f * 1.5, dur: 0.16, type: 'sine', vol: 0.05 });
    },
    clear() { tone({ freq: 340, end: 520, dur: 0.12, type: 'triangle', vol: 0.07 }); },
    hit() {
      noise({ dur: 0.28, vol: 0.3, freq: 700, q: 0.5, type: 'lowpass' });
      tone({ freq: 110, end: 48, dur: 0.3, type: 'sawtooth', vol: 0.14 });
    },
    pulse() {
      tone({ freq: 520, end: 1240, dur: 0.32, type: 'sine', vol: 0.13 });
      noise({ dur: 0.3, vol: 0.12, freq: 1800, q: 0.7 });
    },
    laneMove(lane) { tone({ freq: 250 + lane * 48, dur: 0.06, type: 'triangle', vol: 0.05 }); },
    portalOpen() {
      tone({ freq: 70, end: 220, dur: 3.4, type: 'sawtooth', vol: 0.1 });
      tone({ freq: 140, end: 440, dur: 3.0, type: 'sine', vol: 0.06 });
    },
    portalTraverse() {
      noise({ dur: 0.9, vol: 0.34, freq: 2600, q: 0.4, type: 'highpass' });
      tone({ freq: 180, end: 1500, dur: 0.55, type: 'sawtooth', vol: 0.16 });
      tone({ freq: 90, end: 60, dur: 0.8, type: 'sine', vol: 0.2 });
    },
    dimensionCue(index) { tone({ freq: 300 + index * 82, end: 420 + index * 60, dur: 0.5, type: 'triangle', vol: 0.08 }); },
    finish(won) {
      const notes = won ? [523, 659, 784, 1046] : [330, 262, 196, 147];
      notes.forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.11 }), i * 150));
    }
  };
}
