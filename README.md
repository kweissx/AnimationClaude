# Gazpacho Monster

A retro pixel-art animation: a many-armed tomato monster builds the Gazpacho
logo above itself, pixel by pixel, out of its own body. Once its mass runs
low, what's left of it jumps up and bursts into the final "o" and the ®.

The monster's body is exactly as many pixels as the logo, and each logo
pixel is taken from the body. Every pixel you see placed is one the monster
gave up.

- `anim.js`: the whole animation as a pure `render(t, rgbaBuffer)` function at 192×108.
- `index.html`: browser player with play/pause, a scrubber and an optional CRT scanline effect. Open it directly.
- `export.js`: `node export.js` renders `out/gazpacho-monster.mp4` (960×540) and `out/gazpacho-monster.gif` (768×432). Requires ffmpeg.

## Timeline (about 17 s, loops)

| Time | Beat |
| --- | --- |
| 0–1.4 s | Idle: bobbing, blinking, tentacles wiggling, looks up |
| 1.4–2.3 s | Eight tentacles reach up |
| 2.3–10.8 s | Construction: pixels travel up the tentacles, logo built bottom-up, body shrinks |
| ~11–12 s | Tentacles retract; a tiny cyclops core is left |
| ~12–13.5 s | Core leaps, stem pops off, it bursts into "o®" |
| ~13.5–14.5 s | Shine sweep turns the logo from tomato red to the brand grey |
| then | Hold, glint on the ®, fade, loop |

Tweak the timing constants (`T_BUILD0`, `T_BUILD1`, `TRAVEL`, …), `ARMS` or the
palette `C` at the top of `anim.js`, then re-run `node export.js`.
