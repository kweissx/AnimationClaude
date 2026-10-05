// Gazpacho monster: a many-armed tomato monster builds the Gazpacho logo
// out of its own body, pixel by pixel, until nothing of it is left.
//
// render(t, buf) is a pure function of time: it paints frame t (seconds)
// into a W x H RGBA buffer. The same code drives the browser player
// (index.html) and the GIF/MP4 exporter (export.js).
(function (root) {
  'use strict';

  const W = 192, H = 108;
  const LOGO_X = 30, LOGO_Y = 14;
  const GROUND = 101;
  const ARMS = 8;

  // Logo bitmap, pixelated from the original Gazpacho wordmark.
  const MASK = [
    '....................................................................................................##........................#####.',
    '......#######.....................................................................................####.......................#.##..#',
    '....###########...................................................................................####.......................#.#.#.#',
    '..##############..................................................................................####.......................#.##..#',
    '..##############..................................................................................####.......................#.#.#.#',
    '.######....####..........####..........................####..........#####.............####.......####.####..........####.....#####.',
    '######......##.........############..##########.#############......#############....#########.....###########......#########........',
    '#####.................#############..##########.##############....##############...###########....############....###########.......',
    '#####................##############..##########.##############....##############...############...############...#############......',
    '#####...###########..#####...######.......####..######...######..######...######..######..######..#####..#####...#####...#####......',
    '#####...###########.#####.....#####......#####..#####.....#####..#####.....#####..####......####..####....####..#####.....#####.....',
    '#####...###########.#####......####.....#####...#####......####..####......#####..####............####....####..####......#####.....',
    '#####...###########.####.......####.....####....#####......####..####......#####..####............####....####..####......#####.....',
    '######.......#####..#####......####....#####....#####......####..####......#####..####............####....####..#####.....#####.....',
    '.######.....######..#####.....#####...#####.....######....#####..#####....######..#####....#####..####....####..#####.....####......',
    '.################....######..######..#####......#######..######..######..#######..######..######..####....####...######.######......',
    '..##############......#############..##########.##############....##############...############...####....####....############......',
    '...#############......#############..##########.##############.....#############....##########....####....####....###########.......',
    '.....#########..........######.####..##########.############........############.....########.....####....####......#######.........',
    '........###..............####...................#####..###............###..............####...........................###...........',
    '................................................#####...............................................................................',
    '................................................#####...............................................................................',
    '................................................#####...............................................................................',
    '..................................................###...............................................................................',
  ];
  // The final "o" and the ® are made from the monster's last bit of mass:
  // it leaps up and bursts into them.
  const isFinale = (x) => x >= 112;

  // Retro palette (Endesga-ish).
  const C = {
    bg: [0, 0, 0],
    logo: [158, 158, 158],
    outline: [24, 20, 37],
    bodyDark: [158, 40, 53],
    body: [228, 59, 68],
    bodyLight: [255, 124, 98],
    shine: [255, 222, 206],
    armDark: [25, 60, 62],
    arm: [62, 137, 72],
    armLight: [99, 199, 77],
    eye: [255, 255, 255],
    teeth: [255, 240, 220],
    carry: [255, 160, 90],
    spark: [254, 231, 97],
    sparkEnd: [247, 118, 34],
    flash: [255, 255, 255],
    shadow: [26, 24, 34],
  };

  // Timeline (seconds).
  const T_LOOKUP = 0.9;
  const T_REACH0 = 1.4, T_BUILD0 = 2.3, T_BUILD1 = 10.3;
  const TRAVEL = 0.45;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, f) => a + (b - a) * f;
  const ease = (f) => { f = clamp(f, 0, 1); return f * f * (3 - 2 * f); };
  const easeOut = (f) => { f = clamp(f, 0, 1); return 1 - (1 - f) * (1 - f); };
  const mix = (c1, c2, f) => [lerp(c1[0], c2[0], f), lerp(c1[1], c2[1], f), lerp(c1[2], c2[2], f)];
  function hash(i) {
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---------- setup: logo pixels, body pixels, build schedule ----------

  const logo = [];   // {x, y, reg, ta}
  MASK.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') logo.push({ x: LOGO_X + x, y: LOGO_Y + y, reg: isFinale(x), ta: Infinity });
    }
  });
  const N = logo.length;
  const regPix = logo.filter((p) => p.reg);
  const R = regPix.length;

  // The body is exactly N pixels: the N grid cells closest to the centre of a
  // lumpy ellipse. inner[] is sorted centre-out; mass is spent from the outside in.
  const BODY_RX = 24, BODY_RY = 17;
  const cand = [];
  for (let dy = -24; dy <= 24; dy++) {
    for (let dx = -32; dx <= 32; dx++) {
      const a = Math.atan2(dy, dx);
      const m = Math.hypot(dx / BODY_RX, dy / BODY_RY) * (1 + 0.05 * Math.sin(5 * a + 1)) +
        hash((dy + 64) * 131 + dx + 64) * 0.03;
      cand.push({ dx, dy, m });
    }
  }
  cand.sort((a, b) => a.m - b.m);
  const inner = cand.slice(0, N);

  // Split the non-® pixels into one column band per arm and order each band
  // bottom-up, snaking row by row like a printer head.
  const build = logo.filter((p) => !p.reg).sort((a, b) => a.x - b.x || a.y - b.y);
  const bands = [];
  for (let i = 0; i < ARMS; i++) {
    const band = build.slice(Math.round((i * build.length) / ARMS), Math.round(((i + 1) * build.length) / ARMS));
    const bottom = Math.max(...band.map((p) => p.y));
    band.sort((a, b) => {
      if (a.y !== b.y) return b.y - a.y;
      return (bottom - a.y) % 2 === 0 ? a.x - b.x : b.x - a.x;
    });
    bands.push(band);
  }

  const launches = [];   // every pixel in flight: {arm, j, p, tl, ta, body}
  bands.forEach((band, i) => {
    const span = T_BUILD1 - T_BUILD0 - 0.15;
    band.forEach((p, j) => {
      const tl = T_BUILD0 + i * 0.02 + (j / band.length) * span;
      const l = { arm: i, j, p, tl, ta: tl + TRAVEL, body: null };
      p.ta = l.ta;
      launches.push(l);
    });
  });
  launches.sort((a, b) => a.tl - b.tl);
  launches.forEach((l, g) => { l.body = inner[N - 1 - g]; });
  const launchTimes = launches.map((l) => l.tl);

  const lastArrival = Math.max(...launches.map((l) => l.ta));
  const T_RETRACT0 = lastArrival + 0.1, T_RETRACT1 = T_RETRACT0 + 0.6;
  const T_JUMP0 = T_RETRACT1 + 0.55, T_JUMP1 = T_JUMP0 + 0.15, T_LAND = T_JUMP1 + 0.8;
  const T_SCATTER = 0.45;
  const T_SWEEP0 = T_LAND + T_SCATTER + 0.45, T_SWEEP1 = T_SWEEP0 + 0.9;
  const DURATION = T_SWEEP1 + 2.6;
  const FADE = 0.35;

  // The final R body pixels (the core) fly up and become "o®", matched by angle.
  const REG_CX = Math.round(regPix.reduce((a, p) => a + p.x, 0) / R);
  const REG_CY = Math.round(regPix.reduce((a, p) => a + p.y, 0) / R);
  const core = inner.slice(0, R).map((b) => ({ ...b }));
  const byAngle = (cx, cy) => (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  const coreSorted = core.slice().sort((a, b) => Math.atan2(a.dy, a.dx) - Math.atan2(b.dy, b.dx));
  const regSorted = regPix.slice().sort(byAngle(REG_CX, REG_CY));
  coreSorted.forEach((c, k) => { c.target = regSorted[k]; regSorted[k].ta = T_LAND + T_SCATTER; });

  // The stem pops off as the core leaps.
  const T_STEM = T_JUMP1;

  // ---------- drawing primitives ----------

  let buf = null;
  function px(x, y, c, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    if (a === undefined || a >= 1) {
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
    } else {
      buf[o] = lerp(buf[o], c[0], a); buf[o + 1] = lerp(buf[o + 1], c[1], a); buf[o + 2] = lerp(buf[o + 2], c[2], a);
    }
  }
  function rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c);
  }

  // ---------- state at time t ----------

  function launchedBy(t) {
    let lo = 0, hi = launchTimes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (launchTimes[mid] <= t) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function bodyState(t) {
    const used = launchedBy(t);
    const remaining = N - used;
    const s = Math.sqrt(remaining / N);
    const bob = t < T_JUMP0 ? Math.round(Math.sin(t * 4.2) * 0.9) : 0;
    let cx = 96, cy = GROUND - Math.round(BODY_RY * s) + bob;
    let squash = 0;
    if (t >= T_JUMP0 && t < T_JUMP1) squash = 1;
    if (t >= T_JUMP0 && t < T_JUMP1) cy += 1;
    if (t >= T_JUMP1) {
      const f = clamp((t - T_JUMP1) / (T_LAND - T_JUMP1), 0, 1);
      const sx = cx, sy = cy;
      cx = lerp(sx, REG_CX, f);
      cy = lerp(sy, REG_CY, f) - Math.sin(f * Math.PI) * 16;
    }
    return { remaining, s, cx: Math.round(cx), cy: Math.round(cy), bob, squash };
  }

  function armRoot(i, b) {
    const th = Math.PI + ((i + 0.5) / ARMS) * Math.PI;
    return { x: b.cx + Math.cos(th) * BODY_RX * b.s * 0.9, y: b.cy + Math.sin(th) * BODY_RY * b.s * 0.9, th };
  }

  function armTip(i, t, rootPt) {
    const band = bands[i];
    const idle = {
      x: rootPt.x + Math.cos(rootPt.th) * 9 + Math.sin(t * 5 + i * 1.3) * 2.5,
      y: rootPt.y + Math.sin(rootPt.th) * 9 + Math.cos(t * 4 + i) * 2,
    };
    if (t < T_REACH0) return idle;
    const first = band[0];
    if (t < T_BUILD0) {
      const f = ease((t - T_REACH0) / (T_BUILD0 - T_REACH0));
      return { x: lerp(idle.x, first.x, f), y: lerp(idle.y, first.y, f) };
    }
    const last = band[band.length - 1];
    if (t >= T_RETRACT0) {
      const f = ease((t - T_RETRACT0) / (T_RETRACT1 - T_RETRACT0));
      return { x: lerp(last.x, rootPt.x, f), y: lerp(last.y, rootPt.y, f) };
    }
    // Head toward the pixel that will be laid next.
    let j = 0;
    while (j < band.length && band[j].ta <= t) j++;
    if (j >= band.length) return { x: last.x, y: last.y };
    if (j === 0) return { x: first.x, y: first.y };
    const prev = band[j - 1], next = band[j];
    const f = clamp((t - prev.ta) / (next.ta - prev.ta), 0, 1);
    return { x: lerp(prev.x, next.x, f), y: lerp(prev.y, next.y, f) };
  }

  // Tentacle as a wiggly cubic Bezier from root to tip, sampled to pixels.
  function armPath(i, t, rootPt, tip) {
    const len = Math.hypot(tip.x - rootPt.x, tip.y - rootPt.y);
    const out = Math.min(14, len * 0.4);
    const p0 = rootPt;
    const p1 = { x: rootPt.x + Math.cos(rootPt.th) * out, y: rootPt.y + Math.sin(rootPt.th) * out };
    const p2 = { x: tip.x, y: tip.y + len * 0.35 };
    const p3 = tip;
    const nx = -(tip.y - rootPt.y) / (len || 1), ny = (tip.x - rootPt.x) / (len || 1);
    const amp = Math.min(3, len * 0.08);
    const n = Math.max(2, Math.ceil(len * 1.4));
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n, v = 1 - u;
      let x = v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x;
      let y = v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y;
      const w = amp * Math.sin(u * Math.PI) * Math.sin(t * 6 + i * 1.7 + u * 6);
      x += nx * w; y += ny * w;
      const q = { x: Math.round(x), y: Math.round(y), u };
      const prev = pts[pts.length - 1];
      if (!prev || prev.x !== q.x || prev.y !== q.y) pts.push(q);
    }
    return pts;
  }

  // ---------- render ----------

  function render(t, out) {
    buf = out;
    for (let o = 0; o < out.length; o += 4) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 255; }
    t = ((t % DURATION) + DURATION) % DURATION;

    const b = bodyState(t);
    const flying = t >= T_JUMP1;
    const scattered = t >= T_LAND;

    // Shadow under the monster.
    if (!scattered) {
      const lift = flying ? clamp(1 - (GROUND - 2 - b.cy) / 40, 0.2, 1) : 1;
      const sw = Math.max(2, Math.round(BODY_RX * b.s * 1.1 * lift));
      for (let x = -sw; x <= sw; x++) px(96 + x, GROUND + 1, C.shadow);
      for (let x = -sw + 3; x <= sw - 3; x++) px(96 + x, GROUND + 2, C.shadow);
    }

    // Arms.
    const arms = [];
    if (t < T_RETRACT1) {
      for (let i = 0; i < ARMS; i++) {
        const r = armRoot(i, b);
        arms.push(armPath(i, t, r, armTip(i, t, r)));
      }
      const thick = b.s > 0.45;
      const wide = (q) => thick && q.u < 0.55;
      arms.forEach((pts) => pts.forEach((q) => {
        const w = wide(q) ? 2 : 1;
        rect(q.x - 1, q.y - 1, w + 2, w + 2, C.armDark);
      }));
      arms.forEach((pts) => pts.forEach((q, k) => {
        const w = wide(q) ? 2 : 1;
        rect(q.x, q.y, w, w, C.arm);
        if (w === 2 && k % 4 === 0) px(q.x, q.y, C.armLight);
      }));
      arms.forEach((pts) => { const q = pts[pts.length - 1]; px(q.x, q.y, C.armLight); });
    }

    // Body: remaining mass, outlined and shaded.
    const occ = new Set();
    const bodyPix = scattered ? [] : flying ? core : inner.slice(0, b.remaining);
    bodyPix.forEach((p) => occ.add(p.dx * 1000 + p.dy));
    const rx = Math.max(1, BODY_RX * b.s), ry = Math.max(1, BODY_RY * b.s);
    bodyPix.forEach((p) => {
      const edge = !occ.has((p.dx + 1) * 1000 + p.dy) || !occ.has((p.dx - 1) * 1000 + p.dy) ||
        !occ.has(p.dx * 1000 + p.dy + 1) || !occ.has(p.dx * 1000 + p.dy - 1);
      let c;
      if (edge) c = C.outline;
      else {
        const light = -(p.dx / rx) * 0.6 - (p.dy / ry) * 0.8;
        c = light > 0.5 ? C.bodyLight : light < -0.45 ? C.bodyDark : C.body;
        if (Math.abs(p.dx / rx + 0.42) < 0.12 && Math.abs(p.dy / ry + 0.5) < 0.12 && b.s > 0.4) c = C.shine;
      }
      const sy = b.squash && p.dy < 0 ? 1 : 0;
      px(b.cx + p.dx, b.cy + p.dy + sy, c);
    });

    // Tomato stem, until it pops off.
    if (t < T_STEM) {
      const top = b.cy - Math.round(BODY_RY * b.s);
      [[0, -3], [-1, -2], [0, -2], [1, -2], [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, -1],
        [-2, 0], [0, 0], [2, 0]].forEach(([x, y]) => px(b.cx + x, top + y + 1, y === -1 && Math.abs(x) < 2 ? C.armLight : C.arm));
    } else if (t < T_STEM + 0.6) {
      const f = (t - T_STEM) / 0.6;
      const s0 = Math.sqrt(R / N);
      const top = GROUND - Math.round(BODY_RY * s0) * 2;
      for (let k = 0; k < 6; k++) {
        const vx = (hash(k + 900) - 0.5) * 40, vy = -18 - hash(k + 950) * 14;
        px(96 + vx * f, top + vy * f + 60 * f * f, k % 2 ? C.arm : C.armLight, 1 - f);
      }
    }

    // Face.
    if (!scattered) {
      let look = { x: 0, y: 0 };
      if (t >= T_LOOKUP) look = { x: 0, y: -1 };
      if (t >= T_REACH0 && t < T_RETRACT0) look.x = Math.round(Math.sin(t * 1.3) * 1.2);
      const blinkAt = (o) => {
        const tt = t + o;
        return (tt > 0.55 && tt < 0.67) || (tt % 3.3) < 0.11 || (t > T_RETRACT1 + 0.15 && t < T_RETRACT1 + 0.27);
      };
      const eye = (ex, ey, size, o) => {
        ex = Math.round(ex); ey = Math.round(ey);
        const h = size >> 1;
        if (blinkAt(o)) {
          for (let x = -h; x <= h; x++) px(ex + x, ey, C.outline);
          return;
        }
        rect(ex - h - 1, ey - h - 1, size + 2, size + 2, C.outline);
        for (let y = -h; y <= h; y++) for (let x = -h; x <= h; x++) {
          if (size >= 5 && Math.abs(x) === h && Math.abs(y) === h) continue;
          px(ex + x, ey + y, C.eye);
        }
        if (size >= 5) rect(ex + look.x - (look.x < 0 ? 1 : 0), ey + look.y - (look.y < 0 ? 1 : 0), 2, 2, C.outline);
        else px(ex + look.x, ey + look.y, C.outline);
      };
      const s = b.s;
      if (s > 0.5) {
        eye(b.cx, b.cy - 6 * s, s > 0.6 ? 5 : 3, 0);
        eye(b.cx - 11 * s, b.cy - 2 * s, 3, 0.4);
        eye(b.cx + 11 * s, b.cy - 2 * s, 3, 0.8);
      } else {
        eye(b.cx, b.cy - 2, 5, 0);
      }
      // Grinning mouth, chomping while it works.
      if (s > 0.3) {
        const mw = Math.max(3, Math.round(14 * s)), my = Math.round(b.cy + Math.max(3, 6 * s));
        const working = t >= T_BUILD0 && t < T_RETRACT0;
        const mh = (working && Math.sin(t * 11) > 0) || flying ? 3 : 2;
        for (let y = 0; y < mh; y++) {
          const inset = y === mh - 1 ? 1 : 0;
          for (let x = -mw + inset; x <= mw - inset; x++) px(b.cx + x, my + y, C.outline);
        }
        for (let x = -mw + 2; x <= mw - 2; x += 3) px(b.cx + x, my, C.teeth);
      }
    }

    // Pixels travelling up the tentacles.
    if (t >= T_BUILD0 && t < T_RETRACT0) {
      const hi = launchedBy(t);
      for (let g = 0; g < hi; g++) {
        const l = launches[g];
        if (t >= l.ta) continue;
        const pts = arms[l.arm];
        const start = { x: b.cx + l.body.dx, y: b.cy + l.body.dy };
        const path = [start].concat(pts);
        const f = (t - l.tl) / TRAVEL;
        const e = f * (path.length - 1);
        const k = Math.min(path.length - 2, Math.floor(e));
        const fr = e - k;
        px(lerp(path[k].x, path[k + 1].x, fr), lerp(path[k].y, path[k + 1].y, fr), C.carry);
      }
    }

    // The core bursting into the ®.
    if (scattered && t < T_LAND + T_SCATTER) {
      const f = easeOut((t - T_LAND) / T_SCATTER);
      core.forEach((c) => px(lerp(REG_CX + c.dx, c.target.x, f), lerp(REG_CY + c.dy, c.target.y, f), C.bodyLight));
    }

    // The logo, as built so far.
    const sweepX = lerp(LOGO_X - 14, LOGO_X + 132 + 14, clamp((t - T_SWEEP0) / (T_SWEEP1 - T_SWEEP0), 0, 1));
    logo.forEach((p, k) => {
      if (t < p.ta) return;
      const age = t - p.ta;
      let c;
      const tone = hash(k * 3 + 1);
      const built = tone < 0.25 ? C.bodyLight : tone > 0.9 ? C.bodyDark : C.body;
      if (t >= T_SWEEP0) {
        const d = p.x + (p.y - LOGO_Y) * 0.6 - sweepX;
        c = d < -4 ? C.logo : d <= 4 ? C.flash : built;
      } else {
        c = age < 0.08 ? C.flash : built;
      }
      px(p.x, p.y, c);
      // Construction sparks.
      if (!p.reg && hash(k * 7 + 3) < 0.12 && age < 0.35) {
        const vx = (hash(k * 5 + 11) - 0.5) * 34, vy = -6 - hash(k * 11 + 2) * 22;
        const f = age / 0.35;
        px(p.x + vx * age, p.y + vy * age + 90 * age * age, mix(C.spark, C.sparkEnd, f), 1 - f * 0.5);
      }
    });

    // Glint across the finished logo.
    if (t >= T_SWEEP1) {
      const g = ((t - T_SWEEP1) % 1.6) / 1.6;
      if (g < 0.5) {
        const k = Math.floor(g * 2 * 5);
        const cx = LOGO_X + 133, cy = LOGO_Y - 3;
        const r = [0, 1, 2, 1, 0][k];
        if (r > 0) for (let d = -r; d <= r; d++) { px(cx + d, cy, C.flash, 0.9); px(cx, cy + d, C.flash, 0.9); }
      }
    }

    // Fade in / out so the loop seams cleanly.
    const fade = Math.min(clamp(t / FADE, 0, 1), clamp((DURATION - t) / FADE, 0, 1));
    if (fade < 1) for (let o = 0; o < out.length; o += 4) { out[o] *= fade; out[o + 1] *= fade; out[o + 2] *= fade; }
  }

  const api = { W, H, DURATION, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GazpachoAnim = api;
})(this);
