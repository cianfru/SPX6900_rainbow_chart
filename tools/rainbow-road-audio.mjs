// Rainbow Road — procedural synthwave bed + engine drone → a seamless WAV loop.
//
// We deliberately do NOT use the real OutRun music (e.g. "Passing Breeze") — that's Sega / Hiroshi
// Kawaguchi copyright and X's Content-ID would mute or flag any post using it. This is an ORIGINAL,
// procedurally-synthesised loop in the same 80s-arcade spirit: four-on-the-floor kick, a driving saw
// bass on an Am–F–C–G progression, a bright arpeggio, a soft pad, offbeat hats, and a low engine drone.
// It loops seamlessly; the render tool tiles it to the video length with ffmpeg -stream_loop.
//
//   node tools/rainbow-road-audio.mjs [--out=out/rainbow-road-audio.wav] [--bpm=118]
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SR = 44100, BPM = +arg("bpm", "118"), beat = 60 / BPM, bars = 4, dur = bars * 4 * beat;
const N = Math.round(dur * SR);
const L = new Float32Array(N), R = new Float32Array(N);

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const saw = p => 2 * (p - Math.floor(p + 0.5));
const sq = p => (p - Math.floor(p)) < 0.5 ? 1 : -1;
const sine = p => Math.sin(2 * Math.PI * p);
let seed = 22222; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x40000000 - 1; };
const B = b => Math.round(b * beat * SR);                       // beats → sample index

// mix a mono voice into L/R with equal-power pan and a linear attack / exponential-ish release envelope
function add(gen, s0, len, gain, pan, atk, rel) {
  const a = Math.max(1, Math.round(atk * SR)), r = Math.max(1, Math.round(rel * SR));
  const lg = Math.cos((pan + 1) * Math.PI / 4) * gain, rg = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < len; i++) {
    const idx = s0 + i; if (idx < 0 || idx >= N) continue;
    let env = 1;
    if (i < a) env = i / a;
    else if (i > len - r) env = Math.max(0, (len - i) / r);
    const v = gen(i / SR) * env;
    L[idx] += v * lg; R[idx] += v * rg;
  }
}

// a warm detuned-saw voice (two saws slightly apart) + a sub sine — the workhorse for bass/arp
const voice = (f, detune = 0.004, sub = 0) => t => 0.5 * saw(f * t) + 0.5 * saw(f * (1 + detune) * t) + sub * sine(f * 0.5 * t);

// ── progression: Am – F – C – G (roots + triads), classic uplifting synthwave ──
const ROOTS = [45, 41, 48, 43];                                // A2 F2 C3 G2
const TRIADS = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];

for (let bar = 0; bar < bars; bar++) {
  const root = ROOTS[bar], triad = TRIADS[bar], barStart = bar * 4;
  // bass — driving 8th notes on the root
  for (let e = 0; e < 8; e++) add(voice(midi(root), 0.005, 0.6), B(barStart + e * 0.5), B(0.46), 0.20, 0, 0.004, 0.06);
  // pad — sustained triad, soft, wide
  triad.forEach((m, j) => add(t => sine(midi(m - 12) * t) * 0.6 + saw(midi(m - 12) * t) * 0.4, B(barStart), B(3.9), 0.05, (j - 1) * 0.5, 0.08, 0.3));
  // arpeggio — 16th notes up-down over the triad, bright, panned gently
  const patt = [0, 1, 2, 1];
  for (let s = 0; s < 16; s++) {
    const m = triad[patt[s % patt.length]] + 12;               // an octave up = sparkle
    add(voice(midi(m), 0.006), B(barStart + s * 0.25), B(0.22), 0.085, Math.sin(s) * 0.4, 0.003, 0.05);
  }
  // kick — four on the floor, 55Hz with a fast downward pitch sweep
  for (let bt = 0; bt < 4; bt++) add(t => sine((80 - 30 * Math.min(1, t / 0.05)) * t), B(barStart + bt), B(0.4), 0.55, 0, 0.001, 0.14);
  // hats — offbeat 8ths, short filtered noise
  for (let h = 0; h < 4; h++) add(() => rnd() * 0.5, B(barStart + h + 0.5), B(0.12), 0.05, 0.2, 0.001, 0.03);
}

// ── engine drone — continuous low saw + a touch of brown noise, steady, low in the mix ──
let brown = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  brown = (brown + 0.02 * rnd()) * 0.985;
  const eng = (saw(70 * t) * 0.6 + saw(47 * t) * 0.4) * 0.06 + brown * 0.5 * 0.06;
  L[i] += eng; R[i] += eng;
}

// ── master: soft-clip (tanh) + normalise to a safe peak ──
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i]); R[i] = Math.tanh(R[i]); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = peak > 0 ? 0.89 / peak : 1;

// ── write 16-bit stereo WAV ──
const out = arg("out", fileURLToPath(new URL("../out/rainbow-road-audio.wav", import.meta.url)));
mkdirSync(dirname(out), { recursive: true });
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * norm * 32767))), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * norm * 32767))), 44 + i * 4 + 2);
}
writeFileSync(out, buf);
console.log(`✓ ${out} — ${dur.toFixed(1)}s synthwave+engine loop @ ${BPM} BPM (original, copyright-free)`);
