// File ID: F05 | Revision: R1 — Kalender bulanan
import { STATUSES, STATUS_META, MONTHS, monthGrid, overlaps, fmtDate, el } from './util.js';
import { card } from './kanban.js';

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
let cur = null; // { y, m }
let sel = null; // 'YYYY-MM-DD'

export function renderCalendar(root, ctx) {
  const { tasks, today, me, onOpen } = ctx;
  if (!cur) {
    cur = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 };
    sel = today;
  }
  const rerender = () => renderCalendar(root, ctx);
  const nav = (d) => {
    let { y, m } = cur;
    m += d;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    cur = { y, m };
    rerender();
  };
  const byStart = (a, b) => a.mulai.localeCompare(b.mulai) || a.id.localeCompare(b.id);

  const head = el(
    'div',
    { class: 'cal-head' },
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bulan sebelumnya', onclick: () => nav(-1) }, '‹'),
    el('h2', {}, `${MONTHS[cur.m]} ${cur.y}`),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bulan berikutnya', onclick: () => nav(1) }, '›'),
    el('button', { type: 'button', class: 'btn small', onclick: () => { cur = null; rerender(); } }, 'Hari ini'),
  );

  const legend = el('div', { class: 'legend' }, ...STATUSES.map((s) => el('span', { style: { '--c': STATUS_META[s].color } }, STATUS_META[s].label)));

  const grid = el('div', { class: 'cal-grid' }, ...DOW.map((d) => el('div', { class: 'cal-dow' }, d)));
  monthGrid(cur.y, cur.m).forEach((c, i) => {
    const list = tasks.filter((t) => overlaps(t, c.date)).sort(byStart);
    const col = i % 7;
    const cell = el(
      'button',
      {
        type: 'button',
        class: `cal-cell${c.inMonth ? '' : ' out'}${c.date === today ? ' today' : ''}${c.date === sel ? ' sel' : ''}`,
        'aria-label': `${fmtDate(c.date)}, ${list.length} task`,
        onclick: () => { sel = c.date; rerender(); },
      },
      el('span', { class: 'cal-num' }, String(c.day)),
    );
    list.slice(0, 3).forEach((t) => {
      const s = t.mulai === c.date || col === 0;
      const e = t.selesai === c.date || col === 6;
      cell.append(el('span', { class: `chip${s ? ' s' : ''}${e ? ' e' : ''}`, style: { '--c': STATUS_META[t.status]?.color } }, s ? t.apa : ' '));
    });
    if (list.length > 3) cell.append(el('span', { class: 'more' }, `+${list.length - 3}`));
    grid.append(cell);
  });

  const dayTasks = tasks.filter((t) => overlaps(t, sel)).sort(byStart);
  const day = el(
    'div',
    { class: 'cal-day' },
    el('h3', {}, `Task ${fmtDate(sel)} (${dayTasks.length})`),
    dayTasks.length ? dayTasks.map((t) => card(t, today, me, onOpen)) : el('p', { class: 'empty' }, 'Tidak ada task di tanggal ini'),
  );

  root.replaceChildren(head, legend, grid, day);
}
