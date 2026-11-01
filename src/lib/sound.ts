// Synthesized sound effects (Web Audio API — no audio files). Off by default; Arcana →
// Appearance turns them on and sets the volume. Only these five moments make a sound.
export type SoundName = 'unlock' | 'sealStamp' | 'letterSent' | 'anvil' | 'paymentReceived';

let enabled = false;
let volume = 0.6;
let ctx: AudioContext | null = null;

export function configureSound(config: { soundEnabled: boolean; soundVolume: number }) {
  enabled = config.soundEnabled;
  volume = Math.max(0, Math.min(1, config.soundVolume / 100));
}

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// A tone with a quick attack and exponential decay
function tone(ac: AudioContext, out: AudioNode, freq: number, start: number, decay: number, peak: number, type: OscillatorType = 'sine', endFreq?: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + decay);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + decay + 0.05);
}

// Filtered white noise (clicks, thumps, whooshes)
function noise(ac: AudioContext, out: AudioNode, start: number, length: number, peak: number, filter: BiquadFilterType, from: number, to = from, q = 1) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const biquad = ac.createBiquadFilter();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(from, start);
  biquad.frequency.exponentialRampToValueAtTime(to, start + length);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.02, length / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(biquad).connect(gain).connect(out);
  src.start(start);
  src.stop(start + length + 0.02);
}

const SOUNDS: Record<SoundName, (ac: AudioContext, out: AudioNode, t: number) => void> = {
  // Latch click, then a rising two-note chime
  unlock: (ac, out, t) => {
    noise(ac, out, t, 0.05, 0.5, 'highpass', 2500);
    tone(ac, out, 659, t + 0.06, 0.5, 0.35);
    tone(ac, out, 988, t + 0.16, 0.7, 0.3);
  },
  // Soft wax thump with a falling pitch
  sealStamp: (ac, out, t) => {
    tone(ac, out, 140, t, 0.22, 0.6, 'sine', 55);
    noise(ac, out, t, 0.12, 0.35, 'lowpass', 900, 300);
  },
  // Paper whoosh sweeping upward
  letterSent: (ac, out, t) => {
    noise(ac, out, t, 0.5, 0.45, 'bandpass', 380, 2600, 1.4);
  },
  // Metallic ring: inharmonic partials with staggered decays, plus the strike
  anvil: (ac, out, t) => {
    noise(ac, out, t, 0.04, 0.7, 'highpass', 3000);
    [[523, 1.4, 0.28], [1307, 0.9, 0.18], [2093, 0.6, 0.12], [3135, 0.35, 0.08]].forEach(([f, d, p]) => tone(ac, out, f, t, d, p, 'triangle'));
  },
  // Two bright coin notes
  paymentReceived: (ac, out, t) => {
    tone(ac, out, 1319, t, 0.35, 0.25, 'triangle');
    tone(ac, out, 1760, t + 0.08, 0.55, 0.22, 'triangle');
  },
};

export function playSound(name: SoundName, force = false) {
  if ((!enabled && !force) || volume === 0) return;
  const ac = audio();
  if (!ac) return;
  const master = ac.createGain();
  master.gain.value = volume * 0.6;
  master.connect(ac.destination);
  SOUNDS[name](ac, master, ac.currentTime + 0.01);
}
