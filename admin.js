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
  // ── Evidence formats and limits (one place for every upload) ──
  // Maximum file size per kind. Change a value here to adjust it.
  const IMAGE_LIMIT = 10 * MB;     // JPG, JPEG, PNG, WebP, GIF
  const VIDEO_LIMIT = 100 * MB;    // MP4, WebM
  const DOCUMENT_LIMIT = 25 * MB;  // PDF, DOCX, XLSX, PPTX
  // Minimum length for a new admin password. Change this one line to adjust it.
  const MIN_PASSWORD = 12;
  const MAX_INSPECT_BYTES = 64 * 1024;   // how much of each file is read to verify its format
  const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const POWERPOINT_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const UNIT_CATEGORIES = ['CAT', 'Exam', 'Practical', 'Other'];
  // Every supported format. The extension selects the rule, the file contents are checked
  // against it, and the stored MIME type comes from here rather than from the browser.
  const FORMATS = {
    jpg:  { kind: 'image', mime: 'image/jpeg', limit: IMAGE_LIMIT, magic: [[0, [0xFF, 0xD8, 0xFF]]] },
    jpeg: { kind: 'image', mime: 'image/jpeg', limit: IMAGE_LIMIT, magic: [[0, [0xFF, 0xD8, 0xFF]]] },
    png:  { kind: 'image', mime: 'image/png', limit: IMAGE_LIMIT, magic: [[0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]]] },
    gif:  { kind: 'image', mime: 'image/gif', limit: IMAGE_LIMIT, magic: [[0, 'GIF8']] },
    webp: { kind: 'image', mime: 'image/webp', limit: IMAGE_LIMIT, magic: [[0, 'RIFF'], [8, 'WEBP']] },
    mp4:  { kind: 'video', mime: 'video/mp4', limit: VIDEO_LIMIT, magic: [[4, 'ftyp']] },
    webm: { kind: 'video', mime: 'video/webm', limit: VIDEO_LIMIT, magic: [[0, [0x1A, 0x45, 0xDF, 0xA3]]] },
    pdf:  { kind: 'pdf', mime: 'application/pdf', limit: DOCUMENT_LIMIT, magic: [[0, '%PDF-']] },
    docx: { kind: 'document', mime: WORD_MIME, limit: DOCUMENT_LIMIT, magic: [[0, [0x50, 0x4B, 0x03, 0x04]]], inside: 'word/' },
    xlsx: { kind: 'document', mime: EXCEL_MIME, limit: DOCUMENT_LIMIT, magic: [[0, [0x50, 0x4B, 0x03, 0x04]]], inside: 'xl/' },
    pptx: { kind: 'document', mime: POWERPOINT_MIME, limit: DOCUMENT_LIMIT, magic: [[0, [0x50, 0x4B, 0x03, 0x04]]], inside: 'ppt/' }
  };
  const SUPPORTED_LIST = 'JPG, JPEG, PNG, WebP, GIF, MP4, WebM, PDF, DOCX, XLSX or PPTX';
  // Accept list for file pickers (extensions and MIME types)
  const ACCEPT = Object.keys(FORMATS).map((e) => '.' + e)
    .concat(Object.values(FORMATS).map((f) => f.mime))
    .filter((v, i, a) => a.indexOf(v) === i).join(',');

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

  const bytesMatch = (bytes, offset, expected) => {
    const want = typeof expected === 'string' ? Array.from(expected, (c) => c.charCodeAt(0)) : expected;
    return want.every((b, k) => bytes[offset + k] === b);
  };

  // Checks one file against its format rule. Returns { ok, kind, contentType } or { ok: false, message }.
  async function inspectFile(file) {
    const name = file.name || 'file';
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    const rule = FORMATS[ext];
    if (!rule) return { ok: false, message: name + ': not a supported type. Use ' + SUPPORTED_LIST + '.' };
    if (file.size === 0) return { ok: false, message: name + ': the file is empty.' };
    if (file.size > rule.limit) {
      return { ok: false, message: name + ': larger than ' + (rule.limit / MB) + ' MB. Compress it or choose a smaller file.' };
    }
    const head = new Uint8Array(await file.slice(0, MAX_INSPECT_BYTES).arrayBuffer());
    if (!rule.magic.every(([offset, expected]) => bytesMatch(head, offset, expected))) {
      return { ok: false, message: name + ': the contents do not match a ' + ext.toUpperCase() + ' file. It may have been renamed.' };
    }
    if (rule.inside) {
      const text = Array.from(head, (b) => String.fromCharCode(b)).join('');
      if (!text.includes(rule.inside)) {
        return { ok: false, message: name + ': this is a zip archive but not a valid ' + ext.toUpperCase() + ' file.' };
      }
    }
    return { ok: true, kind: rule.kind, contentType: rule.mime };
  }

  // Stored names look like "<uuid>-<original name>". Show the original name.
  function displayName(path) {
    const name = path.split('/').pop();
    return name.length > 37 ? name.slice(37) : name;
  }

  // Short label for a stored file: Image, Video, PDF, or the Office extension (DOCX, XLSX, PPTX)
  function typeLabel(kind, path) {
    if (kind === 'document') {
      const ext = (displayName(path).split('.').pop() || '').toUpperCase();
      return ext || 'Document';
    }
    return { image: 'Image', video: 'Video', pdf: 'PDF' }[kind] || 'File';
  }

  function safeName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
  }

  // Title for one file in a batch. A typed title is used as-is for one file,
  // or as a prefix ("Title – file name") when several files are chosen.
  function titleFor(file, count, typed) {
    const base = file.name.replace(/\.[^.]+$/, '');
    if (!typed) return base.slice(0, 160);
    return (count === 1 ? typed : typed + ' – ' + base).slice(0, 160);
  }

  // Shows a readable preview for an image, video, PDF or Office document
  function previewFor(kind, url, name, alt, path) {
    if (kind === 'video') return h('video', { src: url, controls: true, preload: 'metadata', class: 'admin-preview' });
    if (kind === 'image') return h('img', { src: url, alt: alt, loading: 'lazy', class: 'admin-preview' });
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'admin-pdf',
      'aria-label': 'Open ' + name + ' in a new tab' },
      h('span', { class: 'admin-pdf__badge', text: typeLabel(kind, path), 'aria-hidden': 'true' }),
      h('span', { class: 'admin-pdf__name', text: name }),
      h('span', { class: 'admin-pdf__open', text: 'Open in a new tab' }));
  }

  // ── Multi-file uploader ──────────────────────────────────
  // Files are processed one at a time: check, store, then record. If the record cannot be
  // saved, the stored copy is removed so no orphan file is left. Failed files stay in the
  // report and can be retried without uploading the saved ones again.
  let uploadBusy = false;
  // Upload reports for project cards. Kept across list refreshes, so the outcome of an upload
  // (including failed files and their Retry button) stays visible until the next upload.
  const projectReports = new Map();

  function setControls(controls, busy) {
    controls.forEach((c) => { c.disabled = busy; });
  }

  function storageMessage(error) {
    const text = (error && error.message ? error.message : '').toLowerCase();
    if (/mime|not supported|invalid.*type/.test(text)) {
      return 'Supabase Storage does not allow this file type. Run the evidence migration, and check the portfolio-media bucket\'s allowed types.';
    }
    if (/exceed|too large|maximum allowed size/.test(text)) {
      return 'This file is larger than the storage limit set in Supabase for portfolio-media.';
    }
    return fail(error, 'Upload failed.');
  }

  function drawReport(batch) {
    const el = batch.reportEl;
    el.replaceChildren();
    el.hidden = false;
    const saved = batch.items.filter((i) => i.status === 'saved').length;
    const failed = batch.items.filter((i) => i.status === 'failed');
    const done = saved + failed.length;
    const summary = batch.running
      ? 'Uploading ' + (done + 1) + ' of ' + batch.items.length + '…'
      : (saved + ' saved' + (failed.length ? ', ' + failed.length + ' failed.' : '.'));
    const labels = { waiting: 'Waiting', uploading: 'Uploading…', saved: 'Saved', failed: 'Failed' };
    el.append(h('p', { class: 'upload-report__summary', text: summary }));
    el.append(h('ul', { class: 'upload-report__list' }, batch.items.map((item) =>
      h('li', { class: 'upload-report__item upload-report__item--' + item.status },
        h('span', { class: 'upload-report__name', text: item.file.name }),
        h('span', { class: 'upload-report__status', text: labels[item.status] }),
        item.status === 'failed' ? h('span', { class: 'upload-report__error', text: item.message }) : null))));
    if (!batch.running && failed.length) {
      el.append(h('button', { type: 'button', class: 'admin-btn admin-btn--primary', text: 'Retry ' + failed.length + ' failed', onclick: () => {
        batch.items.forEach((i) => { if (i.status === 'failed') i.status = 'waiting'; });
        runBatch(batch);
      } }));
    }
  }

  // Validates, stores and records one file. Returns { ok, message }.
  async function saveOne(item, batch) {
    const check = await inspectFile(item.file);
    if (!check.ok) return { ok: false, message: check.message };

    const path = batch.prefix + crypto.randomUUID() + '-' + safeName(item.file.name);
    const { error: upErr } = await client.storage.from(bucket).upload(path, item.file, {
      contentType: check.contentType, upsert: false, cacheControl: '3600'
    });
    if (upErr) return { ok: false, message: storageMessage(upErr) };

    const { error: rowErr } = await client.from(batch.table).insert(batch.buildRow(item, check, path));
    if (rowErr) {
      const { error: cleanErr } = await client.storage.from(bucket).remove([path]);
      return { ok: false, message: fail(rowErr, 'Could not save the record.') +
        (cleanErr ? ' The stored copy could not be removed. Delete this path in Storage: ' + path
                  : ' The file was not kept.') };
    }
    return { ok: true };
  }

  async function runBatch(batch) {
    if (uploadBusy) return say(batch.msgEl, 'An upload is already in progress. Wait for it to finish.', true);
    uploadBusy = true;
    batch.running = true;
    setControls(batch.controls, true);
    try {
      drawReport(batch);
      for (const item of batch.items) {
        if (item.status !== 'waiting') continue;   // saved items are never uploaded again
        item.status = 'uploading';
        drawReport(batch);
        const result = await saveOne(item, batch);
        item.status = result.ok ? 'saved' : 'failed';
        item.message = result.ok ? '' : result.message;
        drawReport(batch);
      }
    } finally {
      batch.running = false;
      uploadBusy = false;
      setControls(batch.controls, false);
      drawReport(batch);
      if (batch.onDone) batch.onDone(batch);
    }
  }

  // Starts a batch from the chosen files. Returns when the batch has finished.
  function startBatch(options) {
    const batch = Object.assign({ running: false }, options, {
      items: Array.from(options.files, (f) => ({ file: f, status: 'waiting', message: '' }))
    });
    return runBatch(batch);
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
  // File pickers only offer the supported formats (also enforced on upload)
  $('poeFile').setAttribute('accept', ACCEPT);
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
      // Remove the project record first (its media rows cascade), then its stored files
      const paths = (p.project_media || []).map((m) => m.storage_path);
      const { error } = await client.from('projects').delete().eq('id', p.id);
      if (error) return say(msg, fail(error, 'Could not delete the project.'), true);
      if (paths.length) {
        const { error: storageErr } = await client.storage.from(bucket).remove(paths);
        if (storageErr) return say(msg, 'The project was removed, but its files could not be deleted. Delete these paths in Storage: ' + paths.join(', '), true);
      }
      loadProjects();
    } });

    const mediaList = h('div', { class: 'admin-media-grid' },
      (p.project_media || []).sort((a, b) => a.sort - b.sort).map((m) => mediaItem(m, p)));

    const uploadMsg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });
    const reportEl = projectReports.get(p.id) ||
      h('div', { class: 'upload-report', hidden: true, 'aria-live': 'polite' });
    projectReports.set(p.id, reportEl);
    const fileInput = h('input', { type: 'file', multiple: true, accept: ACCEPT, 'aria-label': 'Images, videos, PDFs or Word, Excel or PowerPoint files' });
    const alt = h('input', { type: 'text', maxlength: 200, placeholder: 'Describe the image (optional)', 'aria-label': 'Alt text for the image' });
    const upload = h('button', { type: 'button', class: 'admin-btn admin-btn--primary', text: 'Upload files', onclick: () => {
      const files = Array.from(fileInput.files || []);
      if (!files.length) return say(uploadMsg, 'Choose one or more files first.', true);
      say(uploadMsg, '');
      startBatch({
        files, reportEl, msgEl: uploadMsg, controls: [upload], prefix: p.id + '/', table: 'project_media',
        buildRow: (item, check, path) => ({ project_id: p.id, kind: check.kind, storage_path: path,
          alt_text: alt.value.trim(), is_published: true }),
        onDone: (batch) => {
          if (batch.items.every((i) => i.status === 'saved')) {
            fileInput.value = '';
            alt.value = '';
          }
          loadProjects();
        }
      });
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
        h('label', { class: 'admin-field' }, 'Add images, videos, PDFs or Office files (select several at once)', fileInput),
        h('label', { class: 'admin-field' }, 'Alt text (applied to every file in this upload)', alt),
        upload),
      uploadMsg, reportEl);
  }

  function mediaItem(m, project) {
    const url = publicUrl(m.storage_path);
    const name = displayName(m.storage_path);
    const preview = previewFor(m.kind, url, name, m.alt_text || project.title, m.storage_path);
    const msg = h('p', { class: 'admin-msg', hidden: true, role: 'status' });

    const published = h('input', { type: 'checkbox', checked: m.is_published, onchange: async () => {
      const { error } = await client.from('project_media').update({ is_published: published.checked }).eq('id', m.id);
      if (error) { published.checked = !published.checked; return say(msg, fail(error, 'Could not update.'), true); }
      say(msg, published.checked ? 'Shown on the website.' : 'Hidden from the website.');
    } });

    const description = h('input', { type: 'text', maxlength: 200, value: m.alt_text || '', 'aria-label': 'Description (alt text)' });
    const saveDescription = h('button', { type: 'button', class: 'admin-btn', text: 'Save description', onclick: async () => {
      const { error } = await client.from('project_media').update({ alt_text: description.value.trim() }).eq('id', m.id);
      if (error) return say(msg, fail(error, 'Could not save.'), true);
      say(msg, 'Saved.');
    } });

    const remove = h('button', { type: 'button', class: 'admin-btn admin-btn--danger', text: 'Delete file', onclick: async () => {
      if (!confirm('Delete this ' + typeLabel(m.kind, m.storage_path).toLowerCase() + '? This also removes its stored file.')) return;
      // Record first, so the site never links to a missing file; then the stored file
      const { error } = await client.from('project_media').delete().eq('id', m.id);
      if (error) return say(msg, fail(error, 'Could not remove the record.'), true);
      const { error: storageErr } = await client.storage.from(bucket).remove([m.storage_path]);
      if (storageErr) return say(msg, 'The record was removed, but its stored file could not be deleted. Delete this path in Storage: ' + m.storage_path, true);
      loadProjects();
    } });

    return h('div', { class: 'admin-media' },
      preview,
      h('label', { class: 'admin-check' }, published, ' Published'),
      h('label', { class: 'admin-field' }, 'Description', description),
      h('div', { class: 'admin-actions' }, saveDescription, remove),
      msg);
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
    const preview = previewFor(item.kind, url, name, item.title || name, item.storage_path);

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
      if (!confirm('Delete this ' + typeLabel(item.kind, item.storage_path).toLowerCase() + '? This also removes its stored file.')) return;
      // Record first, so the public page never links to a missing file; then the stored file
      const { error } = await client.from('unit_evidence').delete().eq('id', item.id);
      if (error) return say(msg, fail(error, 'Could not remove the record.'), true);
      const { error: storageErr } = await client.storage.from(bucket).remove([item.storage_path]);
      if (storageErr) return say(msg, 'The record was removed, but its stored file could not be deleted. Delete this path in Storage: ' + item.storage_path, true);
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

  $('addPoeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const unitId = Number($('poeUnit').value);
    const files = Array.from($('poeFile').files || []);
    if (!unitId) return say($('poeMessage'), 'Choose a unit first.', true);
    if (!files.length) return say($('poeMessage'), 'Choose one or more files first.', true);
    say($('poeMessage'), '');

    const typed = $('poeTitle').value.trim();
    const category = $('poeCategory').value;
    const published = $('poePublished').checked;
    startBatch({
      files,
      reportEl: $('poeReport'),
      msgEl: $('poeMessage'),
      controls: [$('poeSubmit')],
      prefix: 'units/' + unitId + '/',
      table: 'unit_evidence',
      buildRow: (item, check, path) => ({
        unit_id: unitId,
        category: category,
        title: titleFor(item.file, files.length, typed),
        kind: check.kind,
        storage_path: path,
        is_published: published
      }),
      onDone: (batch) => {
        if (batch.items.every((i) => i.status === 'saved')) {
          $('poeFile').value = '';
          $('poeTitle').value = '';
        }
        loadUnitEvidence();
      }
    });
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
