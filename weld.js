/* ============================================================
   WELD.JS: hero welding scene
   One SVG, no libraries. Each frame moves the torch tip along the
   seam, solves a two-bone arm (inverse kinematics) so the welder
   follows it, grows the bead and emits sparks.

   - Runs only while visible and the tab is active.
   - Pause button (WCAG 2.2.2). Starts paused if the visitor asked
     for reduced motion.
   - Flicker is smoothed and low-amplitude: no rapid flashing.
   ============================================================ */
(function () {
  'use strict';

  const svg = document.getElementById('weld');
  if (!svg) return;
  const $ = (id) => svg.querySelector('#' + id);
  const NS = 'http://www.w3.org/2000/svg';

  // ── Scene settings (SVG units): tweak these to retune the scene ──
  const SEAM_Y = 264;                 // y of the seam on the plate
  const X_START = 330, X_END = 430;   // tip travel along the seam
  const HAND_OFFSET = [-40, -34];     // hand position relative to the tip
  const SHOULDER = [222, 184];        // shoulder at the start of a pass
  const LEAN = [30, 2];               // how far the body leans by the end
  const ARM = 78;                     // length of upper arm and forearm
  const CABLE_END = [92, 447];        // where the torch cable meets the floor

  // Timeline of one pass, in seconds
  const T_STRIKE = 0.5, T_WELD = 5.6, T_COOL = 0.8, T_RETURN = 1.0;
  const CYCLE = T_STRIKE + T_WELD + T_COOL + T_RETURN;

  // ── Elements ─────────────────────────────────────────────
  const el = {
    cool: $('beadCool'), warm: $('beadWarm'), hot: $('beadHot'),
    plateGlow: $('plateGlow'), arcGlow: $('arcGlowDot'), arcCore: $('arcCore'),
    visorGlow: $('visorGlow'), torso: $('torso'), head: $('head'),
    armOutline: $('armOutline'), armPath: $('armPath'), glove: $('glove'),
    torch: $('torch'), nozzle: $('nozzle'), cable: $('cable'), sparks: $('sparks'),
  };
  const pauseBtn = document.getElementById('weldPause');

  // ── Spark pool ───────────────────────────────────────────
  const POOL = 28;
  const sparks = [];
  for (let i = 0; i < POOL; i++) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('opacity', '0');
    el.sparks.appendChild(line);
    sparks.push({ line, life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, bounced: false });
  }
  let spawnDebt = 0;

  function spawn(x, y) {
    const s = sparks.find((p) => p.life <= 0);
    if (!s) return;
    const angle = -Math.PI / 2 + (Math.random() - 0.35) * 2.3;   // fan, leaning away from the welder
    const speed = 90 + Math.random() * 190;
    s.x = x; s.y = y;
    s.vx = Math.cos(angle) * speed;
    s.vy = Math.sin(angle) * speed;
    s.max = s.life = 0.35 + Math.random() * 0.55;
    s.bounced = false;
  }

  function stepSparks(dt) {
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.line.setAttribute('opacity', '0'); continue; }
      s.vy += 520 * dt;                                  // gravity
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (!s.bounced && s.vy > 0 && s.y > SEAM_Y && s.x > 284 && s.x < 496) {   // skip off the plate once
        s.y = SEAM_Y; s.vy *= -0.35; s.vx *= 0.7; s.bounced = true;
      }
      const k = s.life / s.max;
      s.line.setAttribute('x1', s.x.toFixed(1));
      s.line.setAttribute('y1', s.y.toFixed(1));
      s.line.setAttribute('x2', (s.x - s.vx * 0.04).toFixed(1));
      s.line.setAttribute('y2', (s.y - s.vy * 0.04).toFixed(1));
      s.line.setAttribute('stroke', k > 0.6 ? '#FFC93C' : k > 0.3 ? '#FF7A1A' : '#C2331C');
      s.line.setAttribute('opacity', Math.min(1, k * 1.6).toFixed(2));
    }
  }

  // ── Geometry helpers ─────────────────────────────────────
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (t) => t * t * (3 - 2 * t);

  // Two-bone IK. Returns the elbow, choosing the solution that hangs lower.
  function elbow(sx, sy, tx, ty) {
    let dx = tx - sx, dy = ty - sy;
    const d = clamp(Math.hypot(dx, dy), 1, ARM * 2 - 0.5);
    const a = d / 2;                                    // equal bone lengths
    const h = Math.sqrt(Math.max(ARM * ARM - a * a, 0));
    const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
    const bx = sx + ux * a, by = sy + uy * a;
    const e1 = [bx - uy * h, by + ux * h];
    const e2 = [bx + uy * h, by - ux * h];
    return e1[1] > e2[1] ? e1 : e2;
  }

  const set = (node, attrs) => { for (const k in attrs) node.setAttribute(k, attrs[k]); };

  // ── Draw one frame for a given pass position ─────────────
  let flicker = 1, flickerAt = 0;

  function draw(p, arc, beadAlpha, coolAmt, now) {
    const tipX = X_START + (X_END - X_START) * p;
    const tipY = SEAM_Y;

    // body
    const sh = [SHOULDER[0] + LEAN[0] * p, SHOULDER[1] + LEAN[1] * p];
    const hand = [tipX + HAND_OFFSET[0], tipY + HAND_OFFSET[1]];
    const el2 = elbow(sh[0], sh[1], hand[0], hand[1]);
    const bob = Math.sin(now / 900) * 1.2;

    set(el.torso, { x2: sh[0], y2: sh[1] });
    el.head.setAttribute('transform', 'translate(' + (sh[0] + 24) + ' ' + (sh[1] - 36 + bob) + ')');
    const armD = 'M' + sh[0] + ' ' + sh[1] + 'L' + el2[0].toFixed(1) + ' ' + el2[1].toFixed(1) + 'L' + hand[0] + ' ' + hand[1];
    el.armOutline.setAttribute('d', armD);
    el.armPath.setAttribute('d', armD);
    set(el.glove, { cx: hand[0], cy: hand[1] });

    // torch points from the hand to the tip
    const tx = tipX - hand[0], ty = tipY - hand[1], tl = Math.hypot(tx, ty);
    const ux = tx / tl, uy = ty / tl;
    set(el.torch,  { x1: hand[0] - ux * 14, y1: hand[1] - uy * 14, x2: tipX - ux * 15, y2: tipY - uy * 15 });
    set(el.nozzle, { x1: tipX - ux * 15, y1: tipY - uy * 15, x2: tipX - ux * 4, y2: tipY - uy * 4 });
    const ax = hand[0] - ux * 14, ay = hand[1] - uy * 14;
    el.cable.setAttribute('d', 'M' + ax.toFixed(1) + ' ' + ay.toFixed(1) +
      'C' + (ax - 90).toFixed(1) + ' ' + (ay - 70).toFixed(1) + ' 70 340 ' + CABLE_END[0] + ' ' + CABLE_END[1]);

    // bead: cool steel behind, red then orange nearest the arc
    const len = tipX - X_START;
    const visible = len > 0.5 && beadAlpha > 0.01;
    const warmFrom = Math.max(X_START, tipX - 34), hotFrom = Math.max(X_START, tipX - 12);
    const heat = 1 - coolAmt;
    set(el.cool, { x1: X_START, x2: tipX, opacity: visible ? beadAlpha : 0 });
    set(el.warm, { x1: warmFrom, x2: tipX, opacity: visible ? beadAlpha * heat : 0 });
    set(el.hot,  { x1: hotFrom,  x2: tipX, opacity: visible ? beadAlpha * heat * (arc ? 1 : 0.4) : 0 });

    // arc light, with slow low-amplitude flicker
    if (now - flickerAt > 80) { flickerAt = now; flicker = 0.82 + Math.random() * 0.18; }
    const a = arc ? flicker : 0;
    set(el.arcGlow,   { cx: tipX, cy: tipY, r: 22 + 8 * a, opacity: a });
    set(el.arcCore,   { cx: tipX, cy: tipY, opacity: a });
    set(el.plateGlow, { cx: tipX, opacity: a * 0.7 });
    el.visorGlow.setAttribute('opacity', (a * 0.8).toFixed(2));

    return [tipX, tipY];
  }

  // ── Timeline: where is the torch at time t? ──────────────
  function frame(t, now) {
    const c = t % CYCLE;
    let p, arc = 0, beadAlpha = 1, coolAmt = 0;

    if (c < T_STRIKE) {
      p = 0; arc = 1;
    } else if (c < T_STRIKE + T_WELD) {
      p = (c - T_STRIKE) / T_WELD; arc = 1;
    } else if (c < T_STRIKE + T_WELD + T_COOL) {
      p = 1; coolAmt = (c - T_STRIKE - T_WELD) / T_COOL;
    } else {
      const r = (c - T_STRIKE - T_WELD - T_COOL) / T_RETURN;
      p = 1 - ease(r); coolAmt = 1; beadAlpha = 1 - r;
    }
    return { tip: draw(p, arc, beadAlpha, coolAmt, now), arc };
  }

  // ── Loop control ─────────────────────────────────────────
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduce.matches;
  let visible = true;
  let raf = 0, last = 0, clock = 0;

  function tick(now) {
    raf = 0;
    const dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    clock += dt;
    const f = frame(clock, now);
    if (f.arc) {
      spawnDebt += dt * 60;                              // about 60 sparks a second
      while (spawnDebt >= 1) { spawn(f.tip[0], f.tip[1]); spawnDebt -= 1; }
    }
    stepSparks(dt);
    schedule();
  }

  function schedule() {
    if (!raf && !paused && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }

  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  // A still frame: mid-pass, arc lit, a few frozen sparks
  function drawStill() {
    const now = 1000;
    const f = frame(T_STRIKE + T_WELD * 0.62, now);
    for (let i = 0; i < 16; i++) spawn(f.tip[0], f.tip[1]);
    for (let i = 0; i < 6; i++) stepSparks(0.045);
  }

  function setPaused(value) {
    paused = value;
    if (pauseBtn) {
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseBtn.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    }
    if (paused) { stop(); drawStill(); } else { schedule(); }
  }

  if (pauseBtn) pauseBtn.addEventListener('click', () => setPaused(!paused));

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) schedule(); else stop();
    }).observe(svg);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else schedule(); });
  reduce.addEventListener('change', (e) => { if (e.matches) setPaused(true); });

  setPaused(paused);
})();
