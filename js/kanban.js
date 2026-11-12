// File ID: F04 | Revision: R2 — Kanban board (dipakai kanban Plan Task & kanban Dokumen)
import { STATUSES, STATUS_META, isOverdue, canEdit, fmtRange, el, prioFlag, byPriority, jenisOf } from './util.js';

export function card(t, today, me, onOpen, draggable = false, showJenis = false) {
  const over = isOverdue(t, today);
  const mine = canEdit(t, me);
  const flag = prioFlag(t);
  const plan = jenisOf(t) === 'PLAN';
  const c = el(
    'button',
    {
      type: 'button',
      class: `card${over ? ' overdue' : ''}${mine ? '' : ' locked'}`,
      style: { '--c': STATUS_META[t.status]?.color || '#64748b' },
      draggable: draggable && mine ? 'true' : null,
      onclick: () => onOpen(t),
    },
    el('div', { class: 'card-apa' }, t.apa),
    el('div', { class: 'card-meta' }, el('span', {}, '👤 ', t.siapa), el('span', {}, '📅 ', fmtRange(t.mulai, t.selesai))),
    t.status === 'NOTE' && t.catatan ? el('div', { class: 'card-note' }, '📝 ', t.catatan) : null,
    over || !mine || flag || showJenis
      ? el(
          'div',
          { class: 'card-tags' },
          showJenis ? el('span', { class: `tag ${plan ? 'plan' : 'doc'}` }, plan ? 'Plan' : 'Dokumen') : null,
          flag,
          over ? el('span', { class: 'tag red' }, 'OVERDUE') : null,
          mine ? null : el('span', { class: 'tag', title: 'Bukan task Anda' }, '🔒 lihat saja'),
        )
      : null,
  );
  if (draggable && mine) c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', t.id));
  return c;
}

/**
 * statuses: kolom kanban ini. extra: kolom tamu dari kanban lain, mis. Plan Task With Note
 * yang ditampilkan di kanban dokumen ([{ status, tasks }]); kolom tamu tidak menerima drop.
 */
export function renderKanban(root, { tasks, statuses = STATUSES, extra = [], today, me, onOpen, onMove }) {
  const cols = [...extra.map((x) => ({ s: x.status, list: x.tasks, guest: true })), ...statuses.map((s) => ({ s, list: tasks.filter((t) => t.status === s), guest: false }))];
  const board = el('div', { class: 'board', style: { '--cols': String(cols.length) } });
  for (const { s, list: raw, guest } of cols) {
    const list = raw.slice().sort((a, b) => byPriority(a, b) || a.selesai.localeCompare(b.selesai));
    const body = el('div', { class: 'col-b' });
    if (!list.length) body.append(el('p', { class: 'empty' }, 'Kosong'));
    list.forEach((t) => body.append(card(t, today, me, onOpen, !guest)));
    const col = el(
      'section',
      { class: `col${guest ? ' guest' : ''}`, style: { '--c': STATUS_META[s].color } },
      el('header', { class: 'col-h' }, el('span', {}, STATUS_META[s].label), el('span', { class: 'count' }, String(list.length))),
      body,
    );
    if (!guest) {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drop');
      });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drop');
        const t = tasks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
        if (t && t.status !== s) onMove(t, s);
      });
    }
    board.append(col);
  }
  root.replaceChildren(board);
}
