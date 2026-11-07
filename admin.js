(function () {
  'use strict';

  const cfg = window.PORTFOLIO_CONFIG || {};
  const bucket = cfg.MEDIA_BUCKET || 'portfolio-media';
  const MB = 1024 * 1024;
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const VIDEO_TYPES = ['video/mp4', 'video/webm'];
  const IMAGE_LIMIT = 10 * MB;
  const VIDEO_LIMIT = 100 * MB;

  const $ = (id) => document.getElementById(id);
  const configured =
    cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR-') &&
    cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR-');

  if (!configured || !window.supabase) {
    $('configWarning').hidden = false;
    $('loginPanel').hidden = true;
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  let units = [];

  // ── Small DOM helper ──
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const key in props || {}) {
      const value = props[key];
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'value') node.value = value;
      else if (key === 'checked') node.checked = !!value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (value === true) node.setAttribute(key, '');
      else node.setAttribute(key, value);
    }
    children.flat().forEach((c) => { if (c !== null && c !== undefined) node.append(c); });
    return node;
  }

  function say(node, message, isError) {
    node.textContent = message || '';
    node.classList.toggle('is-error', !!isError);
    node.hidden = !message;
  }

  function fail(error, fallback) {
    return (fallback || 'Something went wrong.') + (error && error.message ? ' (' + error.message + ')' : '');
  }

  function publicUrl(path) {
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  // ── Screens ──────────────────────────────────────────────
  function showLogin(message) {
    $('adminPanel').hidden = true;
    $('loginPanel').hidden = false;
    say($('authMessage'), message || '', !!message);
  }

  async function enter() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) return showLogin();

    // Owner check. 
    const { data: owner, error } = await client
      .from('owners')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error || !owner) {
      await client.auth.signOut();
      return showLogin('This account does not have owner access.');
    }

    $('whoami').textContent = session.user.email;
    $('loginPanel').hidden = true;
    $('adminPanel').hidden = false;
    await loadUnits();
    await refreshAll();
  }

  function refreshAll() {
    return Promise.all([loadMarks(), loadProjects()]);
  }

  // ── Sign in / out ────────────────────────────────────────
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    say($('authMessage'), 'Signing in…');
    const { error } = await client.auth.signInWithPassword({
      email: $('email').value.trim(),
      password: $('password').value
    });
    $('password').value = '';
    if (error) return say($('authMessage'), 'Sign-in failed. Check your email and password.', true);
    await enter();
  });

  $('signOut').addEventListener('click', async () => {
    await client.auth.signOut();
    showLogin('Signed out.');
  });

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showLogin();
  });

  // ── Units ────────────────────────────────────────────────
  async function loadUnits() {
    const { data, error } = await client.from('units').select('id, slug, name, has_practicals, sort').order('sort');
    if (error) return say($('accessMessage'), fail(error, 'Could not load units.'), true);
    units = data || [];

    const marksSel = $('marksUnit');
    const projSel = $('projectUnit');
    const keepMarks = marksSel.value;
    const keepProj = projSel.value;

    marksSel.replaceChildren(...units.map((u) => h('option', { value: u.id, text: u.name })));
    projSel.replaceChildren(...units.filter((u) => u.has_practicals)
      .map((u) => h('option', { value: u.id, text: u.name })));

    if (keepMarks) marksSel.value = keepMarks;
    if (keepProj) projSel.value = keepProj;
  }

  $('marksUnit').addEventListener('change', loadMarks);
  $('marksKind').addEventListener('change', loadMarks);
  $('projectUnit').addEventListener('change', loadProjects);

  // ── Marks ────────────────────────────────────────────────
  function validateMark(name, obtained, total) {
    if (!name.trim()) return 'Enter an assessment name or number.';
    if (obtained === '' || !isFinite(Number(obtained)) || Number(obtained) < 0) return 'Enter marks obtained (0 or more).';
    if (total === '' || !isFinite(Number(total)) || Number(total) <= 0) return 'Enter total marks (more than 0).';
    if (Number(obtained) > Number(total)) return 'Marks obtained cannot be more than total marks.';
    return null;
  }

  async function loadMarks() {
    const list = $('marksList');
    list.replaceChildren();
    const unitId = Number($('marksUnit').value);
    const kind = $('marksKind').value;
    if (!unitId) return;

    const { data, error } = await client
      .from('marks')
      .select('*')
      .eq('unit_id', unitId)
      .eq('kind', kind)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) return say($('marksMessage'), fail(error, 'Could not load marks.'), true);
    if (!data.length) list.append(h('p', { class: 'admin-empty', text: 'No ' + kind + ' records yet.' }));
    data.forEach((row) => list.append(markRow(row)));
  }

  function markRow(row) {
    const name = h('input', { type: 'text', maxlength: 120, value: row.assessment_name, 'aria-label': 'Assessment name or number' });
    const obtained = h('input', { type: 'number', min: 0, step: 'any', value: row.marks_obtained, 'aria-label': 'Marks obtained' });
    const total = h('input', { type: 'number', min: 0.01, step: 'any', value: row.total_marks, 'aria-label': 'Total marks' });
    const published = h('input', { type: 'checkbox', checked: row.is_published });
    const msg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });

    const save = h('button', { type: 'button', class: 'admin-btn', text: 'Save', onclick: async () => {
      const err = validateMark(name.value, obtained.value, total.value);
      if (err) return say(msg, err, true);
      const { error } = await client.from('marks').update({
        assessment_name: name.value.trim(),
        marks_obtained: Number(obtained.value),
        total_marks: Number(total.value),
        is_published: published.checked
      }).eq('id', row.id);
      if (error) return say(msg, fail(error, 'Could not save.'), true);
      say(msg, 'Saved.');
    } });

    const remove = h('button', { type: 'button', class: 'admin-btn admin-btn--danger', text: 'Delete', onclick: async () => {
      if (!confirm('Delete this record?')) return;
      const { error } = await client.from('marks').delete().eq('id', row.id);
      if (error) return say(msg, fail(error, 'Could not delete.'), true);
      loadMarks();
    } });

    return h('div', { class: 'admin-row' },
      h('div', { class: 'admin-grid admin-grid--marks' }, name, obtained, total),
      h('label', { class: 'admin-check' }, published, ' Published'),
      h('div', { class: 'admin-actions' }, save, remove),
      msg);
  }

  $('addMarkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = validateMark($('markName').value, $('markObtained').value, $('markTotal').value);
    if (err) return say($('marksMessage'), err, true);

    const { error } = await client.from('marks').insert({
      unit_id: Number($('marksUnit').value),
      kind: $('marksKind').value,
      assessment_name: $('markName').value.trim(),
      marks_obtained: Number($('markObtained').value),
      total_marks: Number($('markTotal').value),
      is_published: $('markPublished').checked
    });
    if (error) return say($('marksMessage'), fail(error, 'Could not add the record.'), true);

    e.target.reset();
    $('markPublished').checked = true;
    say($('marksMessage'), 'Record added.');
    loadMarks();
  });

  // ── Projects ─────────────────────────────────────────────
  async function loadProjects() {
    const list = $('projectList');
    list.replaceChildren();
    const unitId = Number($('projectUnit').value);
    if (!unitId) return;

    const { data, error } = await client
      .from('projects')
      .select('*, project_media(*)')
      .eq('unit_id', unitId)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) return say($('projectMessage'), fail(error, 'Could not load projects.'), true);
    if (!data.length) list.append(h('p', { class: 'admin-empty', text: 'No projects for this unit yet.' }));
    data.forEach((p) => list.append(projectCard(p)));
  }

  function projectCard(p) {
    const title = h('input', { type: 'text', maxlength: 160, value: p.title, 'aria-label': 'Project title' });
    const desc = h('textarea', { rows: 3, maxlength: 1000, 'aria-label': 'Project description', text: p.description || '' });
    const published = h('input', { type: 'checkbox', checked: p.is_published });
    const msg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });

    const save = h('button', { type: 'button', class: 'admin-btn', text: 'Save project', onclick: async () => {
      if (!title.value.trim()) return say(msg, 'Enter a project title.', true);
      const { error } = await client.from('projects').update({
        title: title.value.trim(),
        description: desc.value.trim(),
        is_published: published.checked
      }).eq('id', p.id);
      if (error) return say(msg, fail(error, 'Could not save.'), true);
      say(msg, 'Saved.');
    } });

    const remove = h('button', { type: 'button', class: 'admin-btn admin-btn--danger', text: 'Delete project', onclick: async () => {
      if (!confirm('Delete this project and all its files?')) return;
      // Remove files from storage first, then the project (media rows cascade)
      const paths = (p.project_media || []).map((m) => m.storage_path);
      if (paths.length) {
        const { error: storageErr } = await client.storage.from(bucket).remove(paths);
        if (storageErr) return say(msg, fail(storageErr, 'Could not delete the files.'), true);
      }
      const { error } = await client.from('projects').delete().eq('id', p.id);
      if (error) return say(msg, fail(error, 'Could not delete the project.'), true);
      loadProjects();
    } });

    const mediaList = h('div', { class: 'admin-media-grid' },
      (p.project_media || []).sort((a, b) => a.sort - b.sort).map((m) => mediaItem(m, p)));

    const uploadMsg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });
    const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES.concat(VIDEO_TYPES).join(','), 'aria-label': 'Image or video file' });
    const alt = h('input', { type: 'text', maxlength: 200, placeholder: 'Describe the image (optional)', 'aria-label': 'Alt text for the image' });
    const upload = h('button', { type: 'button', class: 'admin-btn admin-btn--primary', text: 'Upload file', onclick: async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return say(uploadMsg, 'Choose an image or video first.', true);
      await uploadMedia(p, file, alt.value, uploadMsg);
      fileInput.value = '';
      alt.value = '';
    } });

    return h('article', { class: 'admin-project' },
      h('div', { class: 'admin-grid admin-grid--project' },
        h('label', { class: 'admin-field' }, 'Title', title),
        h('label', { class: 'admin-field' }, 'Short description', desc)),
      h('label', { class: 'admin-check' }, published, ' Published'),
      h('div', { class: 'admin-actions' }, save, remove),
      msg,
      h('h4', { class: 'admin-subtitle', text: 'Images and videos' }),
      mediaList,
      h('div', { class: 'admin-upload' },
        h('label', { class: 'admin-field' }, 'Add image or video', fileInput),
        h('label', { class: 'admin-field' }, 'Alt text', alt),
        upload),
      uploadMsg);
  }

  function mediaItem(m, project) {
    const url = publicUrl(m.storage_path);
    const preview = m.kind === 'video'
      ? h('video', { src: url, controls: true, preload: 'metadata', class: 'admin-preview' })
      : h('img', { src: url, alt: m.alt_text || project.title, loading: 'lazy', class: 'admin-preview' });
    const msg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });

    const published = h('input', { type: 'checkbox', checked: m.is_published, onchange: async () => {
      const { error } = await client.from('project_media').update({ is_published: published.checked }).eq('id', m.id);
      if (error) { published.checked = !published.checked; return say(msg, fail(error, 'Could not update.'), true); }
      say(msg, published.checked ? 'Shown on the website.' : 'Hidden from the website.');
    } });

    const remove = h('button', { type: 'button', class: 'admin-btn admin-btn--danger', text: 'Delete file', onclick: async () => {
      if (!confirm('Delete this file?')) return;
      const { error: storageErr } = await client.storage.from(bucket).remove([m.storage_path]);
      if (storageErr) return say(msg, fail(storageErr, 'Could not delete the file.'), true);
      const { error } = await client.from('project_media').delete().eq('id', m.id);
      if (error) return say(msg, fail(error, 'Could not remove the record.'), true);
      loadProjects();
    } });

    return h('div', { class: 'admin-media' },
      preview,
      h('label', { class: 'admin-check' }, published, ' Published'),
      h('div', { class: 'admin-actions' }, remove),
      msg);
  }

  async function uploadMedia(project, file, altText, msgEl) {
    const isImage = IMAGE_TYPES.includes(file.type);
    const isVideo = VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) return say(msgEl, 'Use a JPG, PNG, WebP or GIF image, or an MP4 or WebM video.', true);

    const limit = isImage ? IMAGE_LIMIT : VIDEO_LIMIT;
    if (file.size > limit) {
      return say(msgEl, 'This file is larger than ' + (limit / MB) + ' MB. Compress it and try again.', true);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
    const path = project.id + '/' + crypto.randomUUID() + '-' + safeName;

    say(msgEl, 'Uploading…');
    const { error: uploadErr } = await client.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600'
    });
    if (uploadErr) return say(msgEl, fail(uploadErr, 'Upload failed.'), true);

    const { error: rowErr } = await client.from('project_media').insert({
      project_id: project.id,
      kind: isImage ? 'image' : 'video',
      storage_path: path,
      alt_text: altText.trim(),
      is_published: true
    });
    if (rowErr) {
      await client.storage.from(bucket).remove([path]);   // do not leave an orphan file
      return say(msgEl, fail(rowErr, 'Could not save the file record.'), true);
    }

    say(msgEl, 'Uploaded.');
    loadProjects();
  }

  $('addProjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('projectTitle').value.trim();
    if (!title) return say($('projectMessage'), 'Enter a project title.', true);

    const { error } = await client.from('projects').insert({
      unit_id: Number($('projectUnit').value),
      title: title,
      description: $('projectDesc').value.trim(),
      is_published: $('projectPublished').checked
    });
    if (error) return say($('projectMessage'), fail(error, 'Could not add the project.'), true);

    e.target.reset();
    $('projectPublished').checked = true;
    say($('projectMessage'), 'Project added. Use the card below to upload its images or videos.');
    loadProjects();
  });

  enter();
})();
