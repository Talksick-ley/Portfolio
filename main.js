/* ============================================================
   PORTFOLIO: MAIN.JS  (vanilla JS, no libraries)
   Nav · scroll progress · reveals · scroll-spy · project tabs
   The welder lives in weld.js, the skill diagram in diagram.js.
   ============================================================ */
(function () {
  'use strict';

  const root = document.documentElement;
  const nav = document.getElementById('nav');

  // ── 1. NAV: drawer, Esc, outside click ───────────────────
  (function initNav() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (!nav || !toggle || !links) return;

    function setOpen(open) {
      links.classList.toggle('open', open);
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
    }

    toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));
    links.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && links.classList.contains('open')) { setOpen(false); toggle.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (links.classList.contains('open') && !e.target.closest('#navLinks, #navToggle')) setOpen(false);
    });
    // Leaving the mobile layout while the drawer is open must not leave it stuck
    window.matchMedia('(min-width: 701px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  })();

  // ── 2. SCROLL: weld-bead progress + nav background ───────
  (function initScroll() {
    const bar = document.getElementById('progressBar');
    const head = document.getElementById('progressHead');
    let queued = false;

    function update() {
      queued = false;
      const max = root.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      if (head) {
        head.style.transform = 'translate3d(' + (p * root.clientWidth).toFixed(1) + 'px,0,0)';
        head.style.opacity = p > 0.003 ? '1' : '0';
      }
      if (nav) nav.classList.toggle('nav--scrolled', window.scrollY > 24);
    }
    function onScroll() { if (!queued) { queued = true; requestAnimationFrame(update); } }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  })();

  // ── 3. REVEALS: add .in when an element scrolls into view ─
  (function initReveals() {
    const targets = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
    targets.forEach((el) => io.observe(el));
  })();

  // ── 4. SCROLL-SPY: mark the nav link for the section in view ─
  (function initSpy() {
    const links = Array.from(document.querySelectorAll('.nav__link'));
    const map = new Map();
    links.forEach((a) => {
      const sec = document.querySelector(a.getAttribute('href'));
      if (sec) map.set(sec, a);
    });
    if (!map.size || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = map.get(entry.target);
        if (!link) return;
        if (entry.isIntersecting) {
          links.forEach((l) => l.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
        } else if (link.getAttribute('aria-current')) {
          link.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });   // a thin band across the middle of the viewport
    map.forEach((_, sec) => io.observe(sec));
  })();

  // ── 5. PROJECT TABS (click + arrow keys) ─────────────────
  (function initTabs() {
    const tabs = Array.from(document.querySelectorAll('.projects__tab'));
    if (!tabs.length) return;

    function select(tab, focus) {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next, true); }
      });
    });
    // Start state comes from the markup (first tab selected)
    select(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0], false);
  })();
})();
