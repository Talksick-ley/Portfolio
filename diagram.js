
(function () {
  'use strict';

  const svg = document.getElementById('diagramSvg');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const readout = {
    name: document.getElementById('readoutName'),
    desc: document.getElementById('readoutDesc'),
    links: document.getElementById('readoutLinks'),
  };

  // ── Content ──────────────────────────────────────────────
  // side 'a' = physical (top / left), 'b' = control (bottom / right)
  const NODES = [
    { id: 'mechatronics', label: 'Mechatronics', desc: 'Mechanics, electronics and software designed as one system rather than three separate parts.' },
    { id: 'cad',          label: 'CAD / Design', side: 'a', desc: '3D models and drawings that turn an idea into parts that can be printed or machined.' },
    { id: 'mechanics',    label: 'Mechanics',    side: 'a', desc: 'Linkages, drives and load paths: how motion is produced and carried through a machine.' },
    { id: 'robotics',     label: 'Robotics',     side: 'a', desc: 'Sensing, planning and actuation combined so a machine can act on its surroundings.' },
    { id: 'plc',          label: 'PLC / Control',side: 'b', desc: 'Ladder-logic control with interlocks, sensors and alarms for reliable industrial sequences.' },
    { id: 'electronics',  label: 'Electronics',  side: 'b', desc: 'Circuits, sensors and power stages that connect microcontrollers to the physical world.' },
    { id: 'software',     label: 'Software',     side: 'b', desc: 'Firmware and control code, from PID loops on microcontrollers to dashboards and tooling.' },
    { id: 'automation',   label: 'Automation',   side: 'b', desc: 'Joining machines, controllers and data so a process runs repeatably with little supervision.' },
  ];

  const LINKS = [
    ['cad', 'mechanics'], ['mechanics', 'robotics'],
    ['plc', 'electronics'], ['electronics', 'software'], ['software', 'automation'],
  ];

  const LAYOUTS = {
    wide: {
      w: 800, h: 420,
      bus: [20, 210, 780, 210],
      hub: { x: 730, y: 210, w: 124, h: 34 },
      box: { w: 150, h: 44 },
      pos: { cad: [200, 84], mechanics: [390, 84], robotics: [580, 84],
             plc: [100, 336], electronics: [285, 336], software: [470, 336], automation: [655, 336] },
      labels: [{ x: 20, y: 194, text: 'Physical' }, { x: 20, y: 238, text: 'Control' }],
    },
    tall: {
      w: 360, h: 430,
      bus: [180, 48, 180, 402],
      hub: { x: 180, y: 32, w: 132, h: 34 },
      box: { w: 140, h: 44 },
      pos: { cad: [82, 110], mechanics: [82, 200], robotics: [82, 290],
             plc: [278, 110], electronics: [278, 200], software: [278, 290], automation: [278, 380] },
      labels: [{ x: 12, y: 78, text: 'Physical' }, { x: 208, y: 78, text: 'Control' }],
    },
  };

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const related = (id) => LINKS.filter((l) => l.includes(id)).map((l) => l[0] === id ? l[1] : l[0]);

  // ── State ────────────────────────────────────────────────
  let pinned = 'mechatronics';
  let hover = null;
  let layoutName = null;
  const mobileMQ = window.matchMedia('(max-width: 640px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const current = () => hover || pinned;

  // ── SVG helpers ──────────────────────────────────────────
  function make(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  const timing = (s, d) => 'stroke-dasharray:1;--s:' + s + ';--d:' + d;
  const fade = (s, d) => '--s:' + s + ';--d:' + d;

  // ── Build the drawing for one layout ─────────────────────
  const refs = { nodes: {}, stubs: {}, pulses: {}, dots: {}, links: [] };

  function build(name) {
    const L = LAYOUTS[name];
    const horizontal = name === 'wide';          // bus runs left-right
    svg.innerHTML = '';
    refs.nodes = {}; refs.stubs = {}; refs.pulses = {}; refs.dots = {}; refs.links = [];
    svg.setAttribute('viewBox', '0 0 ' + L.w + ' ' + L.h);

    // corner registration marks
    make('path', {
      class: 'd-corner d-fade', style: fade(0, 0.1),
      d: 'M10 26V10H26M' + (L.w - 26) + ' 10H' + (L.w - 10) + 'V26M10 ' + (L.h - 26) + 'V' + (L.h - 10) + 'H26M' +
         (L.w - 26) + ' ' + (L.h - 10) + 'H' + (L.w - 10) + 'V' + (L.h - 26),
    }, svg);

    // domain labels
    L.labels.forEach((t) => {
      const text = make('text', { class: 'd-label d-fade', x: t.x, y: t.y, style: fade(0.7, 0.15) }, svg);
      text.textContent = t.text;
    });

    // ruler ticks beside the bus
    const [bx1, by1, bx2, by2] = L.bus;
    let ticks = '';
    if (horizontal) {
      for (let x = bx1 + 12, i = 0; x < L.hub.x - L.hub.w / 2 - 8; x += 16, i++) {
        ticks += 'M' + x + ' ' + (by1 + 6) + 'V' + (by1 + (i % 5 === 0 ? 14 : 10));
      }
    } else {
      for (let y = by1 + 24, i = 0; y < by2 - 4; y += 16, i++) {
        ticks += 'M' + (bx1 + 6) + ' ' + y + 'H' + (bx1 + (i % 5 === 0 ? 14 : 10));
      }
    }
    make('path', { class: 'd-tick d-fade', d: ticks, style: fade(0.1, 0.25) }, svg);

    // the bus itself
    make('path', {
      class: 'd-bus d-draw', pathLength: 1, style: timing(0, 0.35),
      d: 'M' + bx1 + ' ' + by1 + 'L' + bx2 + ' ' + by2,
    }, svg);

    // stubs (bus → node), junction dots, signal pulses
    const ids = NODES.filter((n) => n.side).map((n) => n.id);
    ids.forEach((id, i) => {
      const [x, y] = L.pos[id];
      const side = byId[id].side;
      let d, jx, jy;
      if (horizontal) {
        const edge = side === 'a' ? y + L.box.h / 2 : y - L.box.h / 2;
        d = 'M' + x + ' ' + edge + 'V' + by1; jx = x; jy = by1;
      } else {
        const edge = side === 'a' ? x + L.box.w / 2 : x - L.box.w / 2;
        d = 'M' + edge + ' ' + y + 'H' + bx1; jx = bx1; jy = y;
      }
      const s = 0.3 + i * 0.05;
      refs.stubs[id] = make('path', { class: 'd-stub d-draw', pathLength: 1, d: d, style: timing(s, 0.2) }, svg);
      refs.pulses[id] = make('path', { class: 'd-pulse', d: d }, svg);
      refs.dots[id] = make('circle', { class: 'd-dot d-fade', cx: jx, cy: jy, r: 4.5, style: fade(s + 0.15, 0.08) }, svg);
    });

    // dashed interface links between neighbours
    LINKS.forEach(([a, b], i) => {
      const [ax, ay] = L.pos[a], [cx, cy] = L.pos[b];
      let d;
      if (horizontal) d = 'M' + (ax + L.box.w / 2) + ' ' + ay + 'H' + (cx - L.box.w / 2);
      else d = 'M' + ax + ' ' + (ay + L.box.h / 2) + 'V' + (cy - L.box.h / 2);
      const path = make('path', { class: 'd-link d-fade', d: d, style: fade(0.78 + i * 0.03, 0.1) }, svg);
      refs.links.push({ a: a, b: b, el: path });
    });

    // nodes
    NODES.forEach((n, i) => {
      const isHub = n.id === 'mechatronics';
      const size = isHub ? L.hub : { x: L.pos[n.id][0], y: L.pos[n.id][1], w: L.box.w, h: L.box.h };
      const g = make('g', {
        class: 'node d-fade' + (isHub ? ' node--hub' : ''),
        transform: 'translate(' + size.x + ' ' + size.y + ')',
        tabindex: 0, role: 'button', 'data-id': n.id, 'aria-pressed': 'false',
        'aria-label': n.label,
        style: fade(isHub ? 0 : 0.5 + i * 0.04, 0.12),
      }, svg);
      make('rect', { x: -size.w / 2, y: -size.h / 2, width: size.w, height: size.h, rx: 3 }, g);
      const text = make('text', { x: 0, y: 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      text.textContent = n.label;
      refs.nodes[n.id] = g;
    });

    layoutName = name;
    paint();
    measure();
  }

  // ── Paint state (classes + readout) ──────────────────────
  function paint() {
    const cur = current();
    const rel = cur === 'mechatronics' ? [] : related(cur);

    for (const id in refs.nodes) {
      const g = refs.nodes[id];
      g.classList.toggle('is-active', id === cur && id !== 'mechatronics');
      g.classList.toggle('is-related', rel.includes(id) || (id === 'mechatronics' && cur === 'mechatronics'));
      g.setAttribute('aria-pressed', String(id === pinned));
    }
    for (const id in refs.stubs) {
      const on = id === cur || rel.includes(id);
      refs.stubs[id].classList.toggle('is-active', on);
      refs.dots[id].classList.toggle('is-active', on);
      refs.pulses[id].classList.toggle('is-active', on && id === cur);
    }
    refs.links.forEach((l) => {
      l.el.classList.toggle('is-active', cur !== 'mechatronics' && (l.a === cur || l.b === cur));
    });

    const n = byId[cur];
    readout.name.textContent = n.label;
    readout.desc.textContent = n.desc;
    if (cur === 'mechatronics') {
      readout.links.innerHTML = '<strong>Connects</strong> all seven disciplines on one bus.';
    } else {
      const names = rel.map((id) => byId[id].label);
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      readout.links.innerHTML = '<strong>Works closely with</strong> ' + list + '.';
    }
  }

  // ── Scroll-scrubbed drawing ──────────────────────────────
  let queued = false;
  const ref = document.getElementById('diagramHeading') || svg;
  function measure() {
    queued = false;
    if (reduce.matches) { svg.style.setProperty('--p', 1); return; }
    const top = ref.getBoundingClientRect().top;
    const vh = window.innerHeight;
    // Measured from the section heading: starts drawing as the diagram scrolls in and
    // is complete by the time the heading reaches the upper part of the screen.
    // That also means jumping here from the nav always shows the finished drawing.
    const p = (vh * 0.95 - top) / (vh * 0.95 - vh * 0.4);
    svg.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(3));
  }
  function queueMeasure() { if (!queued) { queued = true; requestAnimationFrame(measure); } }
  window.addEventListener('scroll', queueMeasure, { passive: true });
  window.addEventListener('resize', queueMeasure, { passive: true });

  // ── Interaction ──────────────────────────────────────────
  function nodeFrom(e) { const g = e.target.closest('.node'); return g ? g.getAttribute('data-id') : null; }

  function select(id) {
    pinned = (pinned === id && id !== 'mechatronics') ? 'mechatronics' : id;
    hover = null;
    paint();
  }

  svg.addEventListener('click', (e) => { const id = nodeFrom(e); if (id) select(id); });
  svg.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;            // touch uses tap-to-select
    const id = nodeFrom(e);
    if (id && id !== hover) { hover = id; paint(); }
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && hover) { hover = null; paint(); }
  });
  svg.addEventListener('focusin', (e) => { const id = nodeFrom(e); if (id) { hover = id; paint(); } });
  svg.addEventListener('focusout', () => { hover = null; paint(); });
  svg.addEventListener('keydown', (e) => {
    const id = nodeFrom(e);
    if (id && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(id); }
    if (e.key === 'Escape') { pinned = 'mechatronics'; hover = null; paint(); }
  });

  // ── Layout switching ─────────────────────────────────────
  function layoutFor() { return mobileMQ.matches ? 'tall' : 'wide'; }
  function init() { const name = layoutFor(); if (name !== layoutName) build(name); }
  mobileMQ.addEventListener('change', init);
  init();
})();
