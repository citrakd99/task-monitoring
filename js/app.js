// File ID: F02 | Revision: R4 — controller utama
import { api, session, clearSession, cachedTasks, cachedUsers, apiConfigured } from './api.js';
import { STATUSES, STATUS_META, TRANSITIONS, ACTIVE, todayWIB, canEdit, canMove, isOverdue, fmtRange, filterTasks, el, pill, PRIORITIES, PRIORITY_META, prioOf, prioFlag, PLAN_STATUSES, ALL_STATUSES, FINAL, JENIS_META, jenisOf, isActive } from './util.js';
import { buildListPdf, buildTaskPdf, savePdf } from './pdf.js';
import { renderKanban } from './kanban.js';
import { renderCalendar } from './calendar.js';
import { renderWhoWhat } from './whowhat.js';

const $ = (id) => document.getElementById(id);

const S = {
  me: null,
  tasks: [],
  users: [],
  today: todayWIB(),
  view: localStorage.getItem('tm_view') || 'plan',
  mode: localStorage.getItem('tm_mode') === 'PRIBADI' ? 'PRIBADI' : 'TIM',
  f: { siapa: '', status: '', prio: '', jenis: '', note: localStorage.getItem('tm_note') === '1', all: false },
  offline: !navigator.onLine,
  current: null,
  editing: null,
  lastRefresh: 0,
};

/* ---------------- util UI ---------------- */

let toastTimer;
function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3500);
}

function setBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  btn.classList.toggle('busy', busy);
}

function handleErr(e) {
  if (e.code === 401) {
    showLogin(e.message);
    return;
  }
  if (e.code === 409) {
    toast(e.message, true);
    closeDialogs();
    refresh(true);
    return;
  }
  toast(e.message || 'Terjadi kesalahan', true);
}

function closeDialogs() {
  ['taskDlg', 'detailDlg', 'pdfDlg'].forEach((id) => $(id).open && $(id).close());
}

function fillSelect(sel, items, first) {
  sel.replaceChildren(...(first ? [el('option', { value: '' }, first)] : []), ...items.map(([v, l]) => el('option', { value: v }, l)));
}

/* ---------------- login ---------------- */

async function showLogin(msg = '') {
  S.me = null;
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('loginMsg').textContent = msg;
  $('loginPin').value = '';
  if (!apiConfigured()) {
    $('loginMsg').textContent = 'API_URL belum diisi di js/config.js. Lihat CARA_PAKAI.md.';
    return;
  }
  let users = cachedUsers();
  try {
    users = await api.users();
  } catch (e) {
    if (!users.length) $('loginMsg').textContent = e.message;
  }
  fillSelect($('loginNama'), users.map((u) => [u, u]), '— pilih nama —');
  const last = localStorage.getItem('tm_last');
  if (last && users.includes(last)) $('loginNama').value = last;
}

async function onLogin(e) {
  e.preventDefault();
  const btn = e.submitter;
  const nama = $('loginNama').value;
  const pin = $('loginPin').value;
  if (!nama) return ($('loginMsg').textContent = 'Pilih nama dulu');
  setBusy(btn, true);
  $('loginMsg').textContent = '';
  try {
    await api.login(nama, pin);
    localStorage.setItem('tm_last', nama);
    showApp();
  } catch (err) {
    $('loginMsg').textContent = err.message;
  } finally {
    setBusy(btn, false);
  }
}

/* ---------------- app ---------------- */

function showApp() {
  S.me = session().nama;
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('meName').textContent = S.me;
  S.users = cachedUsers();
  const c = cachedTasks();
  if (c) {
    S.tasks = c.tasks;
    S.today = todayWIB();
  }
  render();
  refresh(true);
  api.users().then((u) => { S.users = u; render(); }).catch(() => {});
}

async function refresh(force = false) {
  if (!S.me) return;
  if (S.offline) return render();
  if (!force && Date.now() - S.lastRefresh < 30000) return;
  S.lastRefresh = Date.now();
  $('btnRefresh').classList.add('spin');
  try {
    const d = await api.list();
    S.tasks = d.tasks;
    S.today = d.today;
    render();
  } catch (e) {
    handleErr(e);
  } finally {
    $('btnRefresh').classList.remove('spin');
  }
}

// Tab 'plan' = kanban Plan Task, 'kanban' = kanban Dokumen; Kalender & Who-What memuat keduanya (bisa difilter).
// Mode TIM = task bersama (PIC dari daftar user). Mode PRIBADI = catatan sendiri (PIC diketik bebas, hanya pemilik yang melihat).
const pribadi = () => S.mode === 'PRIBADI';
const modeTasks = () => S.tasks.filter((t) => (pribadi() ? t.pemilik === S.me : !t.pemilik));
const mixed = () => S.view === 'calendar' || S.view === 'whowhat';
const viewJenis = () => (S.view === 'plan' ? 'PLAN' : S.view === 'kanban' ? 'DOC' : S.f.jenis);
const statusOptions = () => (S.f.jenis ? JENIS_META[S.f.jenis].statuses : ALL_STATUSES);
const activeFilter = () => ({ siapa: S.f.siapa, prioritas: S.f.prio, jenis: viewJenis(), status: mixed() ? S.f.status : '' });
const visibleTasks = () => filterTasks(modeTasks(), activeFilter());

function render() {
  if (!S.me) return;
  $('offline').hidden = !S.offline;
  $('fab').hidden = S.offline;

  // filter bar
  const names = [...new Set([...(pribadi() ? [] : S.users), ...modeTasks().map((t) => t.siapa)])].sort();
  document.body.classList.toggle('pribadi', pribadi());
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === S.mode));
  const fs = $('fSiapa');
  const keep = S.f.siapa;
  fillSelect(fs, names.map((n) => [n, n === S.me && !pribadi() ? `${n} (saya)` : n]), pribadi() ? 'Semua PIC' : 'Semua orang');
  fs.value = names.includes(keep) ? keep : '';
  S.f.siapa = fs.value;
  const so = statusOptions();
  fillSelect($('fStatus'), so.map((s) => [s, STATUS_META[s].label]), 'Semua status');
  if (!so.includes(S.f.status)) S.f.status = '';
  $('fStatus').value = S.f.status;
  $('fStatus').hidden = !mixed();
  $('fJenis').hidden = !mixed();
  $('fNoteWrap').hidden = S.view !== 'kanban';
  $('fNote').checked = S.f.note;
  $('fAllWrap').hidden = S.view !== 'whowhat';

  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === S.view));

  const ctx = {
    tasks: visibleTasks(),
    today: S.today,
    me: S.me,
    onOpen: openDetail,
    onMove: moveFromDrag,
  };
  const root = $('view');
  root.dataset.view = S.view;
  if (S.view === 'calendar') renderCalendar(root, { ...ctx, statuses: so });
  else if (S.view === 'whowhat') renderWhoWhat(root, { ...ctx, users: S.f.siapa ? [S.f.siapa] : pribadi() ? [] : S.users, showAll: S.f.all, onPdf: exportPicPdf });
  else if (S.view === 'plan') renderKanban(root, { ...ctx, statuses: PLAN_STATUSES });
  else {
    // kanban dokumen; opsional menampilkan Plan Task With Note sebagai kolom tamu
    const extra = S.f.note ? [{ status: 'NOTE', tasks: filterTasks(modeTasks(), { siapa: S.f.siapa, prioritas: S.f.prio, jenis: 'PLAN', status: 'NOTE' }) }] : [];
    renderKanban(root, { ...ctx, statuses: STATUSES, extra });
  }
}

/* ---------------- detail & transisi ---------------- */

function openDetail(t) {
  S.current = t;
  const mine = canEdit(t, S.me);
  const over = isOverdue(t, S.today);
  const plan = jenisOf(t) === 'PLAN';
  $('detailBody').replaceChildren(
    ...[
    el('h2', {}, t.apa),
    el('div', { class: 'dl' },
      el('span', {}, 'Kanban'), el('span', {}, plan ? 'Plan Task' : 'Tracking Dokumen'),
      el('span', {}, 'Status'), el('span', {}, pill(t.status), over ? el('span', { class: 'tag red' }, 'OVERDUE') : null),
      el('span', {}, 'Prioritas'), el('span', {}, prioFlag(t, true)),
      el('span', {}, plan ? 'PIC' : 'Siapa'), el('span', {}, t.siapa),
      el('span', {}, plan ? 'Plan' : 'Kapan'), el('span', {}, fmtRange(t.mulai, t.selesai)),
      el('span', {}, 'Catatan'), el('span', { class: 'pre' }, t.catatan || '-'),
      el('span', {}, 'Dibuat'), el('span', {}, t.created_by),
    ),
    mine ? null : el('p', { class: 'hint' }, '🔒 Hanya pelaksana atau pembuat task yang bisa mengubah.'),
    ].filter(Boolean),
  );
  const can = mine && !S.offline;
  const next = TRANSITIONS[t.status] || [];
  $('noteWrap').hidden = !can || !next.length;
  $('moveNote').value = '';
  $('moveNote').placeholder = plan ? 'wajib diisi untuk Plan Task With Note' : 'mis. alasan revisi / reject';
  $('detailMsg').textContent = '';
  $('moveBtns').replaceChildren(
    ...(can
      ? next.map((to) =>
          el('button', { type: 'button', class: 'btn move', style: { '--c': STATUS_META[to].color }, onclick: (e) => doMove(t, to, $('moveNote').value, e.currentTarget) },
            FINAL.includes(t.status) ? `Reopen → ${STATUS_META[to].label}` : `→ ${STATUS_META[to].label}`),
        )
      : []),
  );
  $('btnEdit').hidden = !(can && ACTIVE.includes(t.status));
  $('detailDlg').showModal();
}

async function doMove(t, to, note, btn) {
  if (!canMove(t.status, to)) return toast(`Transisi ${t.status} → ${to} tidak diizinkan`, true);
  if (to === 'NOTE' && !String(note || '').trim()) {
    if (!$('detailDlg').open) openDetail(t);
    $('detailMsg').textContent = 'Isi catatan dulu untuk memindahkan ke Plan Task With Note';
    $('moveNote').focus();
    return;
  }
  setBusy(btn, true);
  try {
    await api.move(t.id, t.version, to, note);
    closeDialogs();
    toast(`"${t.apa.slice(0, 30)}" → ${STATUS_META[to].label}`);
    await refresh(true);
  } catch (e) {
    handleErr(e);
  } finally {
    setBusy(btn, false);
  }
}

function moveFromDrag(t, to) {
  if (S.offline) return toast('Offline: tidak bisa mengubah data', true);
  if (!canEdit(t, S.me)) return toast('Bukan task Anda', true);
  if (!canMove(t.status, to)) return toast(`Transisi ${STATUS_META[t.status].label} → ${STATUS_META[to].label} tidak diizinkan`, true);
  doMove(t, to, '', null);
}

/* ---------------- form create / edit ---------------- */

function formLabels(jenis) {
  const p = jenis === 'PLAN';
  $('lblApa').textContent = p ? 'Pekerjaan' : 'Apa (dokumen)';
  $('lblSiapa').textContent = S.formPribadi ? 'PIC (ketik sendiri)' : p ? 'PIC' : 'Siapa';
  $('lblMulai').textContent = p ? 'Plan Start' : 'Mulai';
  $('lblSelesai').textContent = p ? 'Plan Finish' : 'Selesai';
  $('taskDlgTitle').textContent = `${S.editing ? 'Edit' : 'Tambah'} ${p ? 'plan task' : 'task dokumen'}`;
}

function openForm(t = null) {
  S.editing = t;
  const f = $('taskForm');
  const today = todayWIB();
  S.formPribadi = t ? !!t.pemilik : pribadi();
  f.siapa.hidden = S.formPribadi;
  f.siapaTxt.hidden = !S.formPribadi;
  f.siapaTxt.value = t ? t.siapa : '';
  fillSelect($('picList'), [...new Set(modeTasks().map((x) => x.siapa))].sort().map((n) => [n, n]));
  const users = [...S.users];
  if (t && !users.includes(t.siapa)) users.push(t.siapa);
  fillSelect(f.siapa, users.map((u) => [u, u]));
  fillSelect(f.jenis, [['PLAN', 'Plan Task (pekerjaan)'], ['DOC', 'Tracking Dokumen']]);
  f.jenis.value = t ? jenisOf(t) : S.view === 'kanban' ? 'DOC' : S.view === 'plan' ? 'PLAN' : S.f.jenis || 'PLAN';
  f.jenis.disabled = !!t; // jenis kanban tidak bisa diubah setelah dibuat
  formLabels(f.jenis.value);
  f.apa.value = t ? t.apa : '';
  f.siapa.value = t ? t.siapa : S.me;
  fillSelect(f.prioritas, PRIORITIES.map((p) => [p, PRIORITY_META[p].label]));
  f.prioritas.value = t ? prioOf(t) : 'NORMAL';
  f.mulai.value = t ? t.mulai : today;
  f.selesai.value = t ? t.selesai : today;
  f.catatan.value = t ? t.catatan : '';
  $('taskMsg').textContent = '';
  $('taskDlg').showModal();
  f.apa.focus();
}

async function onSaveTask(e) {
  e.preventDefault();
  const f = $('taskForm');
  const task = {
    jenis: f.jenis.value,
    apa: f.apa.value.trim(),
    siapa: S.formPribadi ? f.siapaTxt.value.trim() : f.siapa.value,
    pribadi: S.formPribadi,
    prioritas: f.prioritas.value,
    mulai: f.mulai.value,
    selesai: f.selesai.value,
    catatan: f.catatan.value.trim(),
  };
  if (!task.apa) return ($('taskMsg').textContent = task.jenis === 'PLAN' ? 'Pekerjaan wajib diisi' : 'Apa wajib diisi');
  if (!task.siapa) return ($('taskMsg').textContent = 'PIC wajib diisi');
  if (task.selesai < task.mulai) return ($('taskMsg').textContent = 'Tanggal selesai tidak boleh sebelum tanggal mulai');
  const btn = $('taskSave');
  setBusy(btn, true);
  try {
    if (S.editing) await api.update(S.editing.id, S.editing.version, task);
    else {
      const made = await api.create(task);
      if (made && ((task.jenis === 'PLAN' && made.jenis !== 'PLAN') || (task.pribadi && !made.pemilik))) toast('Server masih versi lama: tempel ulang Code.gs lalu deploy New version', true);
    }
    closeDialogs();
    toast(S.editing ? 'Task diperbarui' : 'Task dibuat');
    await refresh(true);
  } catch (err) {
    if (err.code === 400) $('taskMsg').textContent = err.message;
    else handleErr(err);
  } finally {
    setBusy(btn, false);
  }
}

/* ---------------- export PDF ---------------- */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';

async function exportPdf(build, name) {
  try {
    await savePdf(build(), name);
    closeDialogs();
    toast('PDF dibuat: ' + name);
  } catch {
    toast('Gagal membuat PDF', true);
  }
}

const modeLabel = () => (pribadi() ? ' (catatan pribadi)' : '');

/** Who-What: PDF untuk satu PIC, mengikuti filter yang sedang aktif. */
function exportPicPdf(nama) {
  let tasks = filterTasks(modeTasks(), { ...activeFilter(), siapa: nama });
  if (!S.f.all) tasks = tasks.filter(isActive);
  exportPdf(() => buildListPdf(tasks, { today: S.today, subtitle: `PIC: ${nama}${S.f.all ? '' : ' - task aktif'}` + modeLabel() }), `pic-${slug(nama)}-${S.today}.pdf`);
}

function openPdfDlg() {
  const f = activeFilter();
  const shown = visibleTasks();
  const plan = filterTasks(modeTasks(), { jenis: 'PLAN' });
  const docs = filterTasks(modeTasks(), { jenis: 'DOC' });
  const parts = [mixed() && f.jenis && 'Kanban ' + JENIS_META[f.jenis].label, f.siapa, f.prioritas && PRIORITY_META[f.prioritas].label, f.status && STATUS_META[f.status].label].filter(Boolean);
  const list = (tasks, subtitle, name) => () => exportPdf(() => buildListPdf(tasks, { today: S.today, subtitle: subtitle + modeLabel() }), `${name}${pribadi() ? '-pribadi' : ''}-${S.today}.pdf`);
  $('pdfPlan').textContent = `Kanban Plan Task (${plan.length})`;
  $('pdfDoc').textContent = `Kanban Dokumen (${docs.length})`;
  $('pdfAll').textContent = `Semua: Plan Task + Dokumen (${modeTasks().length})`;
  $('pdfFiltered').textContent = `Sesuai filter: ${parts.join(', ')} (${shown.length})`;
  $('pdfFiltered').hidden = !parts.length;
  $('pdfPlan').onclick = list(plan, 'Kanban Plan Task', 'plan-task');
  $('pdfDoc').onclick = list(docs, 'Kanban Tracking Dokumen', 'tracking-dokumen');
  $('pdfAll').onclick = list(modeTasks(), 'Semua task', 'task-monitoring');
  $('pdfFiltered').onclick = list(shown, 'Filter: ' + parts.join(', '), 'task-' + slug(parts.join('-')));
  $('pdfDlg').showModal();
}

/* ---------------- init ---------------- */

function bind() {
  $('loginForm').addEventListener('submit', onLogin);
  $('taskForm').addEventListener('submit', onSaveTask);
  $('fab').addEventListener('click', () => openForm());
  $('btnEdit').addEventListener('click', () => {
    const t = S.current;
    $('detailDlg').close();
    openForm(t);
  });
  $('btnPdf').addEventListener('click', openPdfDlg);
  $('btnPdfOne').addEventListener('click', () => {
    const t = S.current;
    if (t) exportPdf(() => buildTaskPdf(t, { today: S.today }), `task-${slug(t.apa)}.pdf`);
  });
  $('btnRefresh').addEventListener('click', () => refresh(true));
  $('btnLogout').addEventListener('click', () => {
    clearSession();
    S.tasks = [];
    showLogin();
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      S.view = b.dataset.view;
      localStorage.setItem('tm_view', S.view);
      render();
    }),
  );
  fillSelect($('fJenis'), [['PLAN', 'Kanban Plan Task'], ['DOC', 'Kanban Dokumen']], 'Semua kanban');
  $('fJenis').addEventListener('change', (e) => { S.f.jenis = e.target.value; render(); });
  $('fNote').addEventListener('change', (e) => { S.f.note = e.target.checked; localStorage.setItem('tm_note', S.f.note ? '1' : '0'); render(); });
  $('taskForm').jenis.addEventListener('change', (e) => formLabels(e.target.value));
  document.querySelectorAll('#modeSeg button').forEach((b) =>
    b.addEventListener('click', () => {
      S.mode = b.dataset.mode;
      localStorage.setItem('tm_mode', S.mode);
      S.f.siapa = '';
      render();
    }),
  );
  $('fSiapa').addEventListener('change', (e) => { S.f.siapa = e.target.value; render(); });
  fillSelect($('fPrio'), PRIORITIES.map((p) => [p, PRIORITY_META[p].label]), 'Semua prioritas');
  $('fPrio').addEventListener('change', (e) => { S.f.prio = e.target.value; render(); });
  $('fStatus').addEventListener('change', (e) => { S.f.status = e.target.value; render(); });
  $('fAll').addEventListener('change', (e) => { S.f.all = e.target.checked; render(); });

  const net = () => {
    S.offline = !navigator.onLine;
    render();
    if (!S.offline) refresh(true);
  };
  window.addEventListener('online', net);
  window.addEventListener('offline', net);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

/* ---------------- pasang PWA ---------------- */

let installEvt = null;
function bindInstall() {
  const btn = $('btnInstall');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvt = e;
    btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installEvt = null;
    btn.hidden = true;
    toast('Aplikasi terpasang');
  });
  btn.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice.catch(() => {});
    installEvt = null;
    btn.hidden = true;
  });
}

function init() {
  bind();
  bindInstall();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (session() && apiConfigured()) showApp();
  else showLogin();
}

init();
