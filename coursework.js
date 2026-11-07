(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const status = document.getElementById('workbenchStatus');
  const drawers = Array.from(document.querySelectorAll('.drawer'));

  // ── Drawers ──────────────────────────────────────────────
  function drawerName(drawer) {
    const n = drawer.querySelector('.drawer__name');
    return n ? n.textContent.trim() : '';
  }

  function setOpen(drawer, open) {
    const toggle = drawer.querySelector('.drawer__toggle');
    const panel = drawer.querySelector('.drawer__panel');
    const state = drawer.querySelector('[data-state]');
    drawer.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    panel.inert = !open;
    if (state) state.textContent = open ? 'Close' : 'Open';
  }

  function announce(drawer) {
    if (!status) return;
    status.textContent = drawer
      ? 'Open: ' + drawerName(drawer) + '. Choose a project to view its evidence.'
      : 'No drawer open. Select a unit to view its marks.';
  }

  function openDrawer(drawer) {
    drawers.forEach((d) => { if (d !== drawer) setOpen(d, false); });
    setOpen(drawer, true);
    announce(drawer);
    // Bring the opened drawer into view, but only if it is clipped
    const r = drawer.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      drawer.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
  }

  function closeDrawer(drawer, returnFocus) {
    setOpen(drawer, false);
    announce(null);
    if (returnFocus) drawer.querySelector('.drawer__toggle').focus();
  }

  drawers.forEach((drawer) => {
    const toggle = drawer.querySelector('.drawer__toggle');
    const closeBtn = drawer.querySelector('[data-close]');
    setOpen(drawer, false);   // start closed, with state text and inert panel in sync

    toggle.addEventListener('click', () => {
      if (drawer.classList.contains('is-open')) closeDrawer(drawer, false);
      else openDrawer(drawer);
    });
    if (closeBtn) closeBtn.addEventListener('click', () => closeDrawer(drawer, true));
  });

  // ── Data helpers (unchanged behaviour) ───────────────────
  const cfg = window.PORTFOLIO_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR-') &&
    cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR-');
  if (!configured || !window.supabase) return;   // drawers still work; no data shown

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false }
  });
  const bucket = cfg.MEDIA_BUCKET || 'portfolio-media';

  function cell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }
  function emptyRow(message) {
    const tr = document.createElement('tr');
    tr.className = 'marks__empty';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = message;
    tr.append(td);
    return tr;
  }
  function num(n) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function unitSlugOf(node) {
    const drawer = node.closest('[data-unit-slug]');
    return drawer ? drawer.dataset.unitSlug : null;
  }
  function publicUrl(path) {
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  // ── Marks (same query and rendering as before) ───────────
  async function loadMarks() {
    const { data, error } = await client
      .from('marks')
      .select('kind, assessment_name, marks_obtained, total_marks, sort, created_at, units!inner(slug)')
      .eq('is_published', true)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });

    document.querySelectorAll('tbody[data-marks]').forEach((tbody) => {
      tbody.replaceChildren();
      if (error) { tbody.append(emptyRow('Marks could not be loaded right now.')); return; }

      const slug = unitSlugOf(tbody);
      const kind = tbody.dataset.marks;
      const rows = (data || []).filter((r) => r.units && r.units.slug === slug && r.kind === kind);
      if (!rows.length) { tbody.append(emptyRow('Not yet published.')); return; }

      rows.forEach((r) => {
        const tr = document.createElement('tr');
        tr.append(cell(r.assessment_name), cell(num(r.marks_obtained)), cell(num(r.total_marks)));
        tbody.append(tr);
      });
    });
  }

  // ── Projects: entries in the drawer, evidence in the viewer ─
  const projectsByUnit = {};   // slug -> [{ title, description, media[] }]

  function publishedMedia(p) {
    return (p.project_media || [])
      .filter((m) => m.is_published)
      .sort((a, b) => a.sort - b.sort);
  }

  async function loadProjects() {
    const { data, error } = await client
      .from('projects')
      .select('id, title, description, sort, created_at, is_published, units!inner(slug), project_media(kind, storage_path, alt_text, sort, is_published)')
      .eq('is_published', true)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });

    document.querySelectorAll('[data-project-block]').forEach((block) => {
      const list = block.querySelector('[data-project-list]');
      const empty = block.querySelector('[data-empty]');
      const slug = unitSlugOf(block);
      list.replaceChildren();

      if (error) { empty.hidden = false; empty.textContent = 'Projects could not be loaded right now.'; return; }

      const projects = (data || []).filter((p) => p.is_published === true && p.units && p.units.slug === slug).map((p) => ({
        title: p.title,
        description: p.description || '',
        media: publishedMedia(p)
      }));
      projectsByUnit[slug] = projects;

      empty.hidden = projects.length > 0;
      if (!projects.length) { empty.textContent = 'No published projects yet.'; return; }

      projects.forEach((project, index) => {
        const li = document.createElement('li');
        li.className = 'project-entry-item';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'project-entry';
        btn.dataset.unit = slug;
        btn.dataset.index = String(index);

        const title = document.createElement('span');
        title.className = 'project-entry__title';
        title.textContent = project.title;

        const meta = document.createElement('span');
        meta.className = 'project-entry__meta';
        const n = project.media.length;
        meta.textContent = n ? (n + (n === 1 ? ' item' : ' items') + ' · View evidence')
                             : 'No evidence yet · View details';

        btn.append(title, meta);
        li.append(btn);
        list.append(li);
      });
    });
  }

  // ── Evidence viewer ──────────────────────────────────────
  const viewer = document.getElementById('evidenceViewer');
  const vUnit = document.getElementById('viewerUnit');
  const vTitle = document.getElementById('viewerTitle');
  const vDesc = document.getElementById('viewerDesc');
  const vStage = document.getElementById('viewerStage');
  const vCount = document.getElementById('viewerCount');
  const vPrev = document.getElementById('viewerPrev');
  const vNext = document.getElementById('viewerNext');
  const vClose = document.getElementById('viewerClose');
  let current = { project: null, index: 0, unitName: '', returnTo: null };

  function mediaNode(item, projectTitle) {
    const url = publicUrl(item.storage_path);
    if (item.kind === 'video') {
      const video = document.createElement('video');
      video.controls = true;
      video.preload = 'metadata';
      video.src = url;
      video.className = 'viewer__media';
      return video;
    }
    const img = document.createElement('img');
    img.src = url;
    img.alt = item.alt_text || projectTitle;
    img.className = 'viewer__media';
    return img;
  }

  function renderViewerItem() {
    const media = current.project.media;
    vStage.replaceChildren();
    if (!media.length) {
      const note = document.createElement('p');
      note.className = 'viewer__empty';
      note.textContent = 'No published evidence for this project yet.';
      vStage.append(note);
      vCount.textContent = '';
      vPrev.disabled = true;
      vNext.disabled = true;
      return;
    }
    vStage.append(mediaNode(media[current.index], current.project.title));
    vCount.textContent = (current.index + 1) + ' of ' + media.length;
    const single = media.length < 2;
    vPrev.disabled = single || current.index === 0;
    vNext.disabled = single || current.index === media.length - 1;
  }

  function openViewer(project, unitName, trigger) {
    current = { project, index: 0, unitName, returnTo: trigger };
    vUnit.textContent = unitName;
    vTitle.textContent = project.title;
    vDesc.textContent = project.description;
    vDesc.hidden = !project.description;
    renderViewerItem();
    if (typeof viewer.showModal === 'function') viewer.showModal();
    else viewer.setAttribute('open', '');
    vClose.focus();
  }

  function closeViewer() {
    vStage.replaceChildren();   // stops any playing video
    if (typeof viewer.close === 'function') viewer.close();
    else viewer.removeAttribute('open');
  }

  function step(delta) {
    const count = current.project ? current.project.media.length : 0;
    if (count < 2) return;
    current.index = Math.min(count - 1, Math.max(0, current.index + delta));
    renderViewerItem();
  }

  vPrev.addEventListener('click', () => step(-1));
  vNext.addEventListener('click', () => step(1));
  vClose.addEventListener('click', closeViewer);

  viewer.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });

  viewer.addEventListener('close', () => {
    vStage.replaceChildren();
    if (current.returnTo && current.returnTo.isConnected) current.returnTo.focus();
  });

  // Opening a project entry (event delegation on the project lists)
  document.addEventListener('click', (e) => {
    const entry = e.target.closest('.project-entry');
    if (!entry) return;
    const slug = entry.dataset.unit;
    const project = (projectsByUnit[slug] || [])[Number(entry.dataset.index)];
    if (!project) return;
    const drawer = entry.closest('[data-unit-slug]');
    openViewer(project, drawerName(drawer), entry);
  });

  loadMarks().catch(() => {});
  loadProjects().catch(() => {});
})();
