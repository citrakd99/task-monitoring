// File ID: F06 | Revision: R2 — Who-What (siapa mengerjakan apa)
import { isActive, isOverdue, fmtDate, el, pill, prioOf, PRIORITY_META } from './util.js';

export function groupWhoWhat(tasks, users, today, showAll) {
  const names = new Set(users);
  tasks.forEach((t) => names.add(t.siapa));
  return [...names]
    .map((n) => {
      const all = tasks.filter((t) => t.siapa === n);
      const act = all.filter(isActive);
      return {
        nama: n,
        list: (showAll ? all : act).slice().sort((a, b) => a.selesai.localeCompare(b.selesai)),
        aktif: act.length,
        overdue: act.filter((t) => isOverdue(t, today)).length,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.aktif - a.aktif || a.nama.localeCompare(b.nama));
}

export function renderWhoWhat(root, { tasks, users, today, me, showAll, onOpen, onPdf }) {
  const groups = groupWhoWhat(tasks, users, today, showAll);
  if (!groups.length) {
    root.replaceChildren(el('p', { class: 'empty' }, 'Belum ada data'));
    return;
  }
  root.replaceChildren(
    el(
      'div',
      { class: 'ww' },
      groups.map((g) =>
        el(
          'section',
          { class: `ww-g${g.nama === me ? ' me' : ''}` },
          el(
            'header',
            { class: 'ww-h' },
            el('strong', {}, g.nama, g.nama === me ? ' (saya)' : ''),
            el('span', { class: 'tag' }, `${g.aktif} aktif`),
            g.overdue ? el('span', { class: 'tag red' }, `${g.overdue} overdue`) : null,
            onPdf && g.list.length ? el('button', { type: 'button', class: 'btn small', title: `Export PDF task ${g.nama}`, onclick: () => onPdf(g.nama) }, 'PDF') : null,
          ),
          g.list.length
            ? g.list.map((t) =>
                el(
                  'button',
                  { type: 'button', class: 'ww-row', onclick: () => onOpen(t) },
                  pill(t.status),
                  el('span', { class: 'ww-apa' }, prioOf(t) === 'NORMAL' ? null : el('b', { class: 'ww-flag', style: { '--c': PRIORITY_META[prioOf(t)].color }, title: PRIORITY_META[prioOf(t)].label }, '⚑ '), t.apa),
                  el('span', { class: `ww-due${isOverdue(t, today) ? ' red' : ''}` }, fmtDate(t.selesai)),
                ),
              )
            : el('p', { class: 'empty' }, 'Tidak ada task aktif'),
        ),
      ),
    ),
  );
}
