// File ID: F12 | Revision: R2 — logika murni + helper DOM

export const STATUSES = ['OPEN', 'PROGRESS', 'SUBMIT', 'REVISI', 'CLOSED', 'REJECT'];
export const ACTIVE = ['OPEN', 'PROGRESS', 'SUBMIT', 'REVISI'];

export const STATUS_META = {
  OPEN: { label: 'Open', color: '#64748b' },
  PROGRESS: { label: 'Progress', color: '#2563eb' },
  SUBMIT: { label: 'Submit', color: '#7c3aed' },
  REVISI: { label: 'Revisi', color: '#d97706' },
  CLOSED: { label: 'Closed', color: '#16a34a' },
  REJECT: { label: 'Reject', color: '#dc2626' },
};

export const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL'];
export const PRIORITY_META = {
  URGENT: { label: 'Urgent', color: '#dc2626', rank: 0 },
  HIGH: { label: 'High Priority', color: '#ea580c', rank: 1 },
  NORMAL: { label: 'Normal', color: '#64748b', rank: 2 },
};
export const prioOf = (t) => (PRIORITY_META[t.prioritas] ? t.prioritas : 'NORMAL');
export const byPriority = (a, b) => PRIORITY_META[prioOf(a)].rank - PRIORITY_META[prioOf(b)].rank;

// Cermin aturan server (server tetap penentu akhir).
export const TRANSITIONS = {
  OPEN: ['PROGRESS', 'REJECT'],
  PROGRESS: ['SUBMIT'],
  SUBMIT: ['CLOSED', 'REVISI', 'REJECT'],
  REVISI: ['PROGRESS'],
  CLOSED: ['OPEN'],
  REJECT: ['OPEN'],
};

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function todayWIB(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export const isActive = (t) => ACTIVE.includes(t.status);
export const isOverdue = (t, today) => isActive(t) && t.selesai < today;
export const canEdit = (t, me) => !!me && (t.siapa === me || t.created_by === me);
export const canMove = (from, to) => (TRANSITIONS[from] || []).includes(to);
export const overlaps = (t, day) => t.mulai <= day && t.selesai >= day;

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS_S[Number(m) - 1]} ${y.slice(2)}`;
}

export const fmtRange = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);

/** 42 sel (6 minggu), minggu dimulai Senin. month: 0–11 */
export function monthGrid(year, month) {
  const first = Date.UTC(year, month, 1);
  const dow = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - dow * 86400000;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start + i * 86400000);
    cells.push({ date: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month });
  }
  return cells;
}

export function filterTasks(tasks, { siapa = '', status = '', prioritas = '' } = {}) {
  return tasks.filter((t) => (!siapa || t.siapa === siapa) && (!status || t.status === status) && (!prioritas || prioOf(t) === prioritas));
}

/** Helper DOM aman: teks selalu via text node (anti-XSS), style via CSSOM (lolos CSP). */
export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') for (const [p, pv] of Object.entries(v)) n.style.setProperty(p, pv);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, String(v));
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

export const pill = (status) =>
  el('span', { class: 'pill', style: { '--c': STATUS_META[status]?.color || '#64748b' } }, STATUS_META[status]?.label || status);

/** Flag prioritas. Normal tidak ditampilkan kecuali always = true. */
export function prioFlag(t, always = false) {
  const p = prioOf(t);
  if (p === 'NORMAL' && !always) return null;
  return el('span', { class: 'flag', style: { '--c': PRIORITY_META[p].color } }, p === 'NORMAL' ? '' : '⚑ ', PRIORITY_META[p].label);
}
