// Original three-note chime, synthesized locally; no system or third-party audio.
// Run from any directory: node scripts/generate-download-sound.mjs
import fs from "node:fs";

const sampleRate = 22050;
const notes = [{ start: 0, hz: 659.255 }, { start: 0.16, hz: 830.609 }, { start: 0.32, hz: 987.767 }];
const duration = 0.85;
const samples = Math.round(sampleRate * duration);
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const time = i / sampleRate;
  let value = 0;
  for (const { start, hz } of notes) {
    const t = time - start;
    if (t < 0 || t >= 0.53) continue;
    const envelope = Math.min(1, t / 0.012) * Math.exp(-8 * t) *
      Math.min(1, (0.53 - t) / 0.05);
    value += 0.26 * envelope * (Math.sin(2 * Math.PI * hz * t) +
      0.16 * Math.sin(4 * Math.PI * hz * t));
  }
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2);
}
const directory = new URL("../addon/chrome/content/sounds/", import.meta.url);
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(new URL("download-complete.wav", directory), wav);
