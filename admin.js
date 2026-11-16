/* ============================================================
   ADMIN.JS: owner-only editor for /admin
   The browser only ever holds the publishable key. Every change
   is checked by Supabase Row Level Security, so this script can
   be read by anyone without giving them edit access.
   ============================================================ */
(function () {
  'use strict';

  const cfg = window.PORTFOLIO_CONFIG || {};
  const bucket = cfg.MEDIA_BUCKET || 'portfolio-media';
  const MB = 1024 * 1024;
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const VIDEO_TYPES = ['video/mp4', 'video/webm'];
  const PDF_TYPES = ['application/pdf'];
  const IMAGE_LIMIT = 10 * MB;
  const VIDEO_LIMIT = 100 * MB;
  // PDF evidence size limit. Change this one line to adjust it.
  const PDF_LIMIT = 25 * MB;
  // Word, Excel and PowerPoint evidence size limit. Change this one line to adjust it.
  const DOCUMENT_LIMIT = 25 * MB;
  const DOCUMENT_TYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  const DOCUMENT_EXT = /\.(docx|xlsx|pptx)$/i;
  const LIMITS = { image: IMAGE_LIMIT, video: VIDEO_LIMIT, pdf: PDF_LIMIT, document: DOCUMENT_LIMIT };
  const KIND_LABEL = { image: 'image', video: 'video', pdf: 'PDF', document: 'Word, Excel or PowerPoint file' };
  const UNIT_CATEGORIES = ['CAT', 'Exam', 'Practical', 'Other'];
  const UNIT_KIND_LABEL = { image: 'Image', video: 'Video', pdf: 'PDF', document: 'Document' };
  const PDF_SIGNATURE = '%PDF-';
  // Minimum length for a new admin password. Change this one line to adjust it.
  const MIN_PASSWORD = 12;

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

  // ── Small DOM helpers (no innerHTML, so nothing is parsed as markup) ──
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
    // Shown to the owner only; never includes keys or internal details beyond the message
    return (fallback || 'Something went wrong.') + (error && error.message ? ' (' + error.message + ')' : '');
  }

  function publicUrl(path) {
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  // Decide the media kind from the file. Returns 'image', 'video', 'pdf' or null.
  function mediaKindFor(file) {
    if (IMAGE_TYPES.includes(file.type)) return 'image';
    if (VIDEO_TYPES.includes(file.type)) return 'video';
    if (PDF_TYPES.includes(file.type)) return 'pdf';
    // Some phones report an empty type for PDFs; accept by extension in that case only
    if (!file.type && /\.pdf$/i.test(file.name)) return 'pdf';
    return null;
  }

  // Unit evidence accepts everything project media does, plus Office documents.
  function unitKindFor(file) {
    const kind = mediaKindFor(file);
    if (kind) return kind;
    if (DOCUMENT_TYPES.includes(file.type) || (!file.type && DOCUMENT_EXT.test(file.name))) return 'document';
    return null;
  }

  // Word, Excel and PowerPoint files are ZIP archives, which start with "PK".
  async function looksLikeOfficeFile(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4B;
  }

  // A real PDF starts with "%PDF-". This catches renamed non-PDF files.
  async function looksLikePdf(file) {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...head) === PDF_SIGNATURE;
  }

  // Stored names look like "<uuid>-<original name>". Show the original name.
  function displayName(path) {
    const name = path.split('/').pop();
    return name.length > 37 ? name.slice(37) : name;
  }

  // ── Screens ──────────────────────────────────────────────
  // Set when this page was opened from a password reset link (#type=recovery).
  // Read once at startup, before Supabase removes the token from the address.
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  let recoveryMode = hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';

  // Where the reset email sends the admin. Must also be listed under
  // Supabase Authentication → URL Configuration → Redirect URLs.
  const RESET_REDIRECT = (function () {
    const url = new URL('admin.html', window.location.href);
    url.search = '';
    url.hash = '';
    return url.href;
  })();

  function hideAllPanels() {
    $('adminPanel').hidden = true;
    $('loginPanel').hidden = true;
    $('forgotPanel').hidden = true;
    $('resetPanel').hidden = true;
  }

  function showLogin(message) {
    hideAllPanels();
    $('loginPanel').hidden = false;
    say($('authMessage'), message || '', !!message);
  }

  function showForgot() {
    hideAllPanels();
    $('forgotPanel').hidden = false;
    $('forgotEmail').value = $('email').value.trim();
    say($('forgotMessage'), '', false);
    $('forgotEmail').focus();
  }

  // Shown after a reset link is opened. Needs the recovery session that Supabase creates from the link.
  async function showReset() {
    const { data: { session } } = await client.auth.getSession();
    hideAllPanels();
    if (!session) {
      recoveryMode = false;
      showForgot();
      return say($('forgotMessage'), 'That reset link has expired or was already used. Request a new one below.', true);
    }
    // Remove the token from the address bar now that the session is in place
    if (window.history && history.replaceState) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    $('resetPanel').hidden = false;
    say($('resetMessage'), '', false);
    $('newPassword').focus();
  }

  async function enter() {
    if (recoveryMode) return showReset();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return showLogin();

    // Owner check. This only decides what to show; RLS enforces the real rules.
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

  // ── Forgot password ──────────────────────────────────────
  $('showForgot').addEventListener('click', showForgot);
  $('forgotBack').addEventListener('click', () => showLogin(''));

  $('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('forgotEmail').value.trim();
    if (!email) return say($('forgotMessage'), 'Enter the email address for your admin account.', true);

    say($('forgotMessage'), 'Sending…');
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: RESET_REDIRECT });
      // Rate limiting is the only error shown. Everything else gets the same message as success,
      // so the form cannot be used to find out which emails have accounts.
      if (error && /rate|too many|seconds/i.test(error.message || '')) {
        return say($('forgotMessage'), 'Too many requests. Wait a few minutes and try again.', true);
      }
    } catch (err) {
      return say($('forgotMessage'), 'Could not send the email right now. Try again in a moment.', true);
    }
    say($('forgotMessage'), 'If an admin account exists for that email, a reset link has been sent. Check your inbox and spam folder.');
  });

  // ── New password (after the reset link) ──────────────────
  $('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('newPassword').value;
    const pw2 = $('confirmPassword').value;
    if (pw.length < MIN_PASSWORD) return say($('resetMessage'), 'Use at least ' + MIN_PASSWORD + ' characters.', true);
    if (pw !== pw2) return say($('resetMessage'), 'The two passwords do not match.', true);

    say($('resetMessage'), 'Saving…');
    const { error } = await client.auth.updateUser({ password: pw });
    $('newPassword').value = '';
    $('confirmPassword').value = '';
    if (error) {
      return say($('resetMessage'), fail(error, 'Could not save the new password. If the link has expired, request a new one.'), true);
    }

    // Sign out so the admin signs in normally with the new password
    recoveryMode = false;
    await client.auth.signOut();
    showLogin('Password updated. Sign in with your new password.');
  });

  $('resetCancel').addEventListener('click', async () => {
    recoveryMode = false;
    await client.auth.signOut();
    showLogin('');
  });

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showLogin();
    if (event === 'PASSWORD_RECOVERY') showReset();
  });

  // ── Units ────────────────────────────────────────────────
  async function loadUnits() {
    const { data, error } = await client.from('units').select('id, slug, name, has_practicals, sort').order('sort');
    if (error) return say($('accessMessage'), fail(error, 'Could not load units.'), true);
    units = data || [];

    const projSel = $('projectUnit');
    const keepProj = projSel.value;

    fillMarksUnits();
    const poeSel = $('poeUnit');
    const keepPoe = poeSel.value;
    poeSel.replaceChildren(...units.map((u) => h('option', { value: u.id, text: u.name })));
    if (keepPoe) poeSel.value = keepPoe;
    projSel.replaceChildren(...units.filter((u) => u.has_practicals)
      .map((u) => h('option', { value: u.id, text: u.name })));

    if (keepProj) projSel.value = keepProj;
  }

  // Practical marks can only belong to units that have practicals.
  // Shows the evidence placeholder only for the Practical type.
  function fillMarksUnits() {
    const marksSel = $('marksUnit');
    const kind = $('marksKind').value;
    const keep = marksSel.value;
    const list = kind === 'Practical' ? units.filter((u) => u.has_practicals) : units;

    marksSel.replaceChildren(...list.map((u) => h('option', { value: u.id, text: u.name })));
    if (list.some((u) => String(u.id) === keep)) marksSel.value = keep;
    $('practicalEvidence').hidden = kind !== 'Practical';
  }

  $('marksUnit').addEventListener('change', loadMarks);
  $('marksKind').addEventListener('change', () => { fillMarksUnits(); loadMarks(); });
  $('poeUnit').addEventListener('change', loadUnitEvidence);
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
    const chosen = units.find((u) => String(u.id) === $('marksUnit').value);
    if ($('marksKind').value === 'Practical' && !(chosen && chosen.has_practicals)) {
      return say($('marksMessage'), 'Practical marks can only be added to a unit that has practicals.', true);
    }

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
    const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES.concat(VIDEO_TYPES, PDF_TYPES, ['.pdf']).join(','), 'aria-label': 'Image, video or PDF file' });
    const alt = h('input', { type: 'text', maxlength: 200, placeholder: 'Describe the image (optional)', 'aria-label': 'Alt text for the image' });
    const upload = h('button', { type: 'button', class: 'admin-btn admin-btn--primary', text: 'Upload file', onclick: async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return say(uploadMsg, 'Choose an image, video or PDF first.', true);
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
      h('h4', { class: 'admin-subtitle', text: 'Images, videos and PDFs' }),
      mediaList,
      h('div', { class: 'admin-upload' },
        h('label', { class: 'admin-field' }, 'Add image, video or PDF', fileInput),
        h('label', { class: 'admin-field' }, 'Alt text', alt),
        upload),
      uploadMsg);
  }

  function mediaItem(m, project) {
    const url = publicUrl(m.storage_path);
    let preview;
    if (m.kind === 'video') {
      preview = h('video', { src: url, controls: true, preload: 'metadata', class: 'admin-preview' });
    } else if (m.kind === 'pdf') {
      preview = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'admin-pdf',
        'aria-label': 'Open PDF ' + displayName(m.storage_path) + ' in a new tab' },
        h('span', { class: 'admin-pdf__badge', text: 'PDF', 'aria-hidden': 'true' }),
        h('span', { class: 'admin-pdf__name', text: displayName(m.storage_path) }),
        h('span', { class: 'admin-pdf__open', text: 'Open PDF in a new tab' }));
    } else {
      preview = h('img', { src: url, alt: m.alt_text || project.title, loading: 'lazy', class: 'admin-preview' });
    }
    const msg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });

    const published = h('input', { type: 'checkbox', checked: m.is_published, onchange: async () => {
      const { error } = await client.from('project_media').update({ is_published: published.checked }).eq('id', m.id);
      if (error) { published.checked = !published.checked; return say(msg, fail(error, 'Could not update.'), true); }
      say(msg, published.checked ? 'Shown on the website.' : 'Hidden from the website.');
    } });

    const remove = h('button', { type: 'button', class: 'admin-btn admin-btn--danger', text: 'Delete file', onclick: async () => {
      if (!confirm('Delete this ' + KIND_LABEL[m.kind] + '? This also removes its stored file.')) return;
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
    const kind = mediaKindFor(file);
    if (!kind) return say(msgEl, 'Use a JPG, PNG, WebP or GIF image, an MP4 or WebM video, or a PDF document.', true);

    const label = KIND_LABEL[kind];
    if (file.size === 0) return say(msgEl, 'This file is empty. Choose a different file.', true);
    if (file.size > LIMITS[kind]) {
      return say(msgEl, 'This ' + label + ' is larger than ' + (LIMITS[kind] / MB) + ' MB. Compress it or choose a smaller file.', true);
    }
    if (kind === 'pdf' && !(await looksLikePdf(file))) {
      return say(msgEl, 'This file is not a valid PDF. Export it again and try once more.', true);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
    const path = project.id + '/' + crypto.randomUUID() + '-' + safeName;

    say(msgEl, 'Uploading ' + label + '…');
    const { error: uploadErr } = await client.storage.from(bucket).upload(path, file, {
      contentType: kind === 'pdf' ? 'application/pdf' : file.type,
      upsert: false,
      cacheControl: '3600'
    });
    if (uploadErr) {
      const text = (uploadErr.message || '').toLowerCase();
      if (/mime|not supported|invalid.*type/.test(text)) {
        return say(msgEl, 'Supabase Storage does not allow this file type yet. Add application/pdf to the portfolio-media bucket\'s allowed types (see the setup guide).', true);
      }
      if (/exceed|too large|maximum allowed size/.test(text)) {
        return say(msgEl, 'This file is larger than the storage limit set in Supabase for portfolio-media.', true);
      }
      return say(msgEl, fail(uploadErr, 'Upload failed.'), true);
    }

    const { error: rowErr } = await client.from('project_media').insert({
      project_id: project.id,
      kind: kind,
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

  // ── Unit evidence (portfolio of evidence) ─────────────────
  async function loadUnitEvidence() {
    const list = $('poeList');
    list.replaceChildren();
    const unitId = Number($('poeUnit').value);
    if (!unitId) return;

    const { data, error } = await client
      .from('unit_evidence')
      .select('*')
      .eq('unit_id', unitId)
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) return say($('poeMessage'), fail(error, 'Could not load unit evidence.'), true);
    if (!data.length) list.append(h('p', { class: 'admin-empty', text: 'No evidence for this unit yet.' }));
    data.forEach((item) => list.append(unitEvidenceRow(item)));
  }

  function unitEvidenceRow(item) {
    const url = publicUrl(item.storage_path);
    const name = displayName(item.storage_path);
    let preview;
    if (item.kind === 'image') {
      preview = h('img', { src: url, alt: item.title || name, loading: 'lazy', class: 'admin-preview' });
    } else if (item.kind === 'video') {
      preview = h('video', { src: url, controls: true, preload: 'metadata', class: 'admin-preview' });
    } else {
      preview = h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'admin-pdf',
        'aria-label': 'Open ' + name + ' in a new tab' },
        h('span', { class: 'admin-pdf__badge', text: UNIT_KIND_LABEL[item.kind] || 'File', 'aria-hidden': 'true' }),
        h('span', { class: 'admin-pdf__name', text: name }),
        h('span', { class: 'admin-pdf__open', text: 'Open in a new tab' }));
    }

    const title = h('input', { type: 'text', maxlength: 160, value: item.title || '', 'aria-label': 'Title shown on the website' });
    const category = h('select', { 'aria-label': 'Category' },
      UNIT_CATEGORIES.map((c) => h('option', { value: c, text: c, selected: c === item.category })));
    const published = h('input', { type: 'checkbox', checked: item.is_published });
    const msg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });

    const save = h('button', { type: 'button', class: 'admin-btn', text: 'Save', onclick: async () => {
      const { error } = await client.from('unit_evidence').update({
        title: title.value.trim(),
        category: category.value,
        is_published: published.checked
      }).eq('id', item.id);
      if (error) return say(msg, fail(error, 'Could not save.'), true);
      say(msg, 'Saved.');
    } });

    const remove = h('button', { type: 'button', class: 'admin-btn admin-btn--danger', text: 'Delete file', onclick: async () => {
      if (!confirm('Delete this ' + (UNIT_KIND_LABEL[item.kind] || 'file').toLowerCase() + '? This also removes its stored file.')) return;
      const { error: storageErr } = await client.storage.from(bucket).remove([item.storage_path]);
      if (storageErr) return say(msg, fail(storageErr, 'Could not delete the file.'), true);
      const { error } = await client.from('unit_evidence').delete().eq('id', item.id);
      if (error) return say(msg, fail(error, 'Could not remove the record.'), true);
      loadUnitEvidence();
    } });

    return h('div', { class: 'admin-row' },
      preview,
      h('div', { class: 'admin-grid admin-grid--project' },
        h('label', { class: 'admin-field' }, 'Title', title),
        h('label', { class: 'admin-field' }, 'Category', category)),
      h('label', { class: 'admin-check' }, published, ' Published'),
      h('div', { class: 'admin-actions' }, save, remove),
      msg);
  }

  $('addPoeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = $('poeMessage');
    const unitId = Number($('poeUnit').value);
    const file = $('poeFile').files && $('poeFile').files[0];
    if (!unitId) return say(msgEl, 'Choose a unit first.', true);
    if (!file) return say(msgEl, 'Choose a file first.', true);

    const kind = unitKindFor(file);
    if (!kind) return say(msgEl, 'Use a JPG, PNG, WebP or GIF image, an MP4 or WebM video, a PDF, or a Word, Excel or PowerPoint file.', true);
    if (file.size === 0) return say(msgEl, 'This file is empty. Choose a different file.', true);
    if (file.size > LIMITS[kind]) {
      return say(msgEl, 'This ' + KIND_LABEL[kind] + ' is larger than ' + (LIMITS[kind] / MB) + ' MB. Compress it or choose a smaller file.', true);
    }
    if (kind === 'pdf' && !(await looksLikePdf(file))) {
      return say(msgEl, 'This file is not a valid PDF. Export it again and try once more.', true);
    }
    if (kind === 'document' && !(await looksLikeOfficeFile(file))) {
      return say(msgEl, 'This file is not a valid Word, Excel or PowerPoint file. Save it again and try once more.', true);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
    const path = 'units/' + unitId + '/' + crypto.randomUUID() + '-' + safeName;
    const contentType = kind === 'pdf' ? 'application/pdf'
      : kind === 'document' && !file.type ? 'application/octet-stream' : file.type;

    say(msgEl, 'Uploading ' + KIND_LABEL[kind] + '…');
    const { error: uploadErr } = await client.storage.from(bucket).upload(path, file, {
      contentType: contentType, upsert: false, cacheControl: '3600'
    });
    if (uploadErr) {
      const text = (uploadErr.message || '').toLowerCase();
      if (/mime|not supported|invalid.*type/.test(text)) {
        return say(msgEl, 'Supabase Storage does not allow this file type yet. Run the unit evidence migration, which adds Office file types to the portfolio-media bucket.', true);
      }
      if (/exceed|too large|maximum allowed size/.test(text)) {
        return say(msgEl, 'This file is larger than the storage limit set in Supabase for portfolio-media.', true);
      }
      return say(msgEl, fail(uploadErr, 'Upload failed.'), true);
    }

    const { error: rowErr } = await client.from('unit_evidence').insert({
      unit_id: unitId,
      category: $('poeCategory').value,
      title: $('poeTitle').value.trim(),
      kind: kind,
      storage_path: path,
      is_published: $('poePublished').checked
    });
    if (rowErr) {
      await client.storage.from(bucket).remove([path]);   // do not leave an orphan file
      return say(msgEl, fail(rowErr, 'Could not save the evidence record.'), true);
    }

    e.target.reset();
    $('poePublished').checked = true;
    say(msgEl, 'Evidence uploaded.');
    loadUnitEvidence();
  });

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
