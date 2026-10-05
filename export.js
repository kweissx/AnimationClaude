// Renders the animation offline and encodes it with ffmpeg.
//   node export.js            -> out/gazpacho-monster.gif and .mp4
// Frames are rendered at native 192x108 and upscaled with nearest-neighbour.
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { W, H, DURATION, render } = require('./anim.js');

const FPS = 30;
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

const frames = Math.round(DURATION * FPS);
const raw = Buffer.alloc(W * H * 4 * frames);
const frame = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < frames; i++) {
  render(i / FPS, frame);
  raw.set(frame, i * W * H * 4);
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
    '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', ...args], { input: raw, stdio: ['pipe', 'inherit', 'inherit'], maxBuffer: 1 << 30 });
  if (r.status !== 0) process.exit(r.status || 1);
}

ffmpeg(['-vf', 'scale=iw*5:ih*5:flags=neighbor', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
  '-pix_fmt', 'yuv420p', path.join(outDir, 'gazpacho-monster.mp4')]);
ffmpeg(['-vf', 'scale=iw*4:ih*4:flags=neighbor,split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none',
  '-loop', '0', path.join(outDir, 'gazpacho-monster.gif')]);
console.log(`${frames} frames, ${DURATION.toFixed(2)}s -> ${outDir}`);
