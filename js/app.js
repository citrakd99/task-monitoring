// File ID: F02 | Revision: R2 — controller utama
import { api, session, clearSession, cachedTasks, cachedUsers, apiConfigured } from './api.js';
import { STATUSES, STATUS_META, TRANSITIONS, ACTIVE, todayWIB, canEdit, canMove, isOverdue, fmtRange, filterTasks, el, pill, PRIORITIES, PRIORITY_META, prioOf, prioFlag } from './util.js';
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
  view: localStorage.getItem('tm_view') || 'kanban',
  f: { siapa: '', status: '', prio: '', all: false },
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

const activeFilter = () => ({ siapa: S.f.siapa, prioritas: S.f.prio, status: S.view === 'calendar' ? S.f.status : '' });
const visibleTasks = () => filterTasks(S.tasks, activeFilter());

function render() {
  if (!S.me) return;
  $('offline').hidden = !S.offline;
  $('fab').hidden = S.offline;

  // filter bar
  const names = [...new Set([...S.users, ...S.tasks.map((t) => t.siapa)])].sort();
  const fs = $('fSiapa');
  const keep = S.f.siapa;
  fillSelect(fs, names.map((n) => [n, n === S.me ? `${n} (saya)` : n]), 'Semua orang');
  fs.value = names.includes(keep) ? keep : '';
  S.f.siapa = fs.value;
  $('fStatus').hidden = S.view !== 'calendar';
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
  if (S.view === 'calendar') renderCalendar(root, ctx);
  else if (S.view === 'whowhat') renderWhoWhat(root, { ...ctx, users: S.f.siapa ? [S.f.siapa] : S.users, showAll: S.f.all });
  else renderKanban(root, ctx);
}

/* ---------------- detail & transisi ---------------- */

function openDetail(t) {
  S.current = t;
  const mine = canEdit(t, S.me);
  const over = isOverdue(t, S.today);
  $('detailBody').replaceChildren(
    ...[
    el('h2', {}, t.apa),
    el('div', { class: 'dl' },
      el('span', {}, 'Status'), el('span', {}, pill(t.status), over ? el('span', { class: 'tag red' }, 'OVERDUE') : null),
      el('span', {}, 'Prioritas'), el('span', {}, prioFlag(t, true)),
      el('span', {}, 'Siapa'), el('span', {}, t.siapa),
      el('span', {}, 'Kapan'), el('span', {}, fmtRange(t.mulai, t.selesai)),
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
  $('detailMsg').textContent = '';
  $('moveBtns').replaceChildren(
    ...(can
      ? next.map((to) =>
          el('button', { type: 'button', class: 'btn move', style: { '--c': STATUS_META[to].color }, onclick: (e) => doMove(t, to, $('moveNote').value, e.currentTarget) },
            t.status === 'CLOSED' || t.status === 'REJECT' ? 'Reopen → Open' : `→ ${STATUS_META[to].label}`),
        )
      : []),
  );
  $('btnEdit').hidden = !(can && ACTIVE.includes(t.status));
  $('detailDlg').showModal();
}

async function doMove(t, to, note, btn) {
  if (!canMove(t.status, to)) return toast(`Transisi ${t.status} → ${to} tidak diizinkan`, true);
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

function openForm(t = null) {
  S.editing = t;
  const f = $('taskForm');
  const today = todayWIB();
  const users = [...S.users];
  if (t && !users.includes(t.siapa)) users.push(t.siapa);
  fillSelect(f.siapa, users.map((u) => [u, u]));
  $('taskDlgTitle').textContent = t ? 'Edit task' : 'Task baru';
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
    apa: f.apa.value.trim(),
    siapa: f.siapa.value,
    prioritas: f.prioritas.value,
    mulai: f.mulai.value,
    selesai: f.selesai.value,
    catatan: f.catatan.value.trim(),
  };
  if (!task.apa) return ($('taskMsg').textContent = 'Apa wajib diisi');
  if (task.selesai < task.mulai) return ($('taskMsg').textContent = 'Tanggal selesai tidak boleh sebelum tanggal mulai');
  const btn = $('taskSave');
  setBusy(btn, true);
  try {
    if (S.editing) await api.update(S.editing.id, S.editing.version, task);
    else await api.create(task);
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

function openPdfDlg() {
  const f = activeFilter();
  const shown = visibleTasks();
  const parts = [f.siapa, f.prioritas && PRIORITY_META[f.prioritas].label, f.status && STATUS_META[f.status].label].filter(Boolean);
  $('pdfAll').textContent = `Semua task (${S.tasks.length})`;
  $('pdfFiltered').textContent = `Sesuai filter: ${parts.join(', ')} (${shown.length})`;
  $('pdfFiltered').hidden = !parts.length;
  $('pdfAll').onclick = () => exportPdf(() => buildListPdf(S.tasks, { today: S.today, subtitle: 'Semua task' }), `task-monitoring-${S.today}.pdf`);
  $('pdfFiltered').onclick = () => exportPdf(() => buildListPdf(shown, { today: S.today, subtitle: 'Filter: ' + parts.join(', ') }), `task-monitoring-${slug(parts.join('-'))}-${S.today}.pdf`);
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
  fillSelect($('fStatus'), STATUSES.map((s) => [s, STATUS_META[s].label]), 'Semua status');
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
