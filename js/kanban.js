// File ID: F04 | Revision: R1 — Kanban board
import { STATUSES, STATUS_META, isOverdue, canEdit, fmtRange, el, prioFlag, byPriority } from './util.js';

export function card(t, today, me, onOpen, draggable = false) {
  const over = isOverdue(t, today);
  const mine = canEdit(t, me);
  const flag = prioFlag(t);
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
    over || !mine || flag
      ? el('div', { class: 'card-tags' }, flag, over ? el('span', { class: 'tag red' }, 'OVERDUE') : null, mine ? null : el('span', { class: 'tag', title: 'Bukan task Anda' }, '🔒 lihat saja'))
      : null,
  );
  if (draggable && mine) c.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', t.id));
  return c;
}

export function renderKanban(root, { tasks, today, me, onOpen, onMove }) {
  const board = el('div', { class: 'board' });
  for (const s of STATUSES) {
    const list = tasks.filter((t) => t.status === s).sort((a, b) => byPriority(a, b) || a.selesai.localeCompare(b.selesai));
    const body = el('div', { class: 'col-b' });
    if (!list.length) body.append(el('p', { class: 'empty' }, 'Kosong'));
    list.forEach((t) => body.append(card(t, today, me, onOpen, true)));
    const col = el(
      'section',
      {
        class: 'col',
        style: { '--c': STATUS_META[s].color },
        ondragover: (e) => {
          e.preventDefault();
          col.classList.add('drop');
        },
        ondragleave: () => col.classList.remove('drop'),
        ondrop: (e) => {
          e.preventDefault();
          col.classList.remove('drop');
          const t = tasks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
          if (t && t.status !== s) onMove(t, s);
        },
      },
      el('header', { class: 'col-h' }, el('span', {}, STATUS_META[s].label), el('span', { class: 'count' }, String(list.length))),
      body,
    );
    board.append(col);
  }
  root.replaceChildren(board);
}
