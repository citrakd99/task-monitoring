import test from 'node:test';
import assert from 'node:assert/strict';
import { todayWIB, isOverdue, canEdit, canMove, overlaps, monthGrid, filterTasks, fmtDate, fmtRange } from '../js/util.js';
import { groupWhoWhat } from '../js/whowhat.js';

const T = (o) => ({ id: Math.random().toString(36), apa: 'x', siapa: 'A', created_by: 'A', mulai: '2026-11-11', selesai: '2026-11-11', status: 'OPEN', version: 1, ...o });

test('todayWIB: 18:00 UTC = besoknya di WIB', () => {
  assert.equal(todayWIB(new Date('2026-11-11T18:00:00Z')), '2026-11-12');
  assert.equal(todayWIB(new Date('2026-11-11T16:59:00Z')), '2026-11-11');
});

test('AC-001.6 overdue hanya untuk status aktif yang lewat tanggal', () => {
  assert.equal(isOverdue(T({ selesai: '2026-11-10' }), '2026-11-11'), true);
  assert.equal(isOverdue(T({ selesai: '2026-11-11' }), '2026-11-11'), false);
  assert.equal(isOverdue(T({ selesai: '2026-11-01', status: 'CLOSED' }), '2026-11-11'), false);
  assert.equal(isOverdue(T({ selesai: '2026-11-01', status: 'REJECT' }), '2026-11-11'), false);
});

test('ownership & transisi (cermin server)', () => {
  assert.equal(canEdit(T({ siapa: 'B', created_by: 'A' }), 'A'), true);
  assert.equal(canEdit(T({ siapa: 'B', created_by: 'A' }), 'B'), true);
  assert.equal(canEdit(T({ siapa: 'B', created_by: 'A' }), 'C'), false);
  assert.equal(canMove('SUBMIT', 'OPEN'), false);
  assert.equal(canMove('SUBMIT', 'REVISI'), true);
});

test('AC-002.1 monthGrid Nov 2026: 42 sel, mulai Senin 26 Okt', () => {
  const g = monthGrid(2026, 10);
  assert.equal(g.length, 42);
  assert.equal(g[0].date, '2026-10-26');
  assert.equal(g.find((c) => c.inMonth).date, '2026-11-01');
  assert.equal(g.filter((c) => c.inMonth).length, 30);
});

test('task lintas bulan muncul di kedua bulan', () => {
  const t = T({ mulai: '2026-11-28', selesai: '2026-12-03' });
  assert.ok(monthGrid(2026, 10).some((c) => c.inMonth && overlaps(t, c.date)));
  assert.ok(monthGrid(2026, 11).some((c) => c.inMonth && overlaps(t, c.date)));
  assert.equal(overlaps(t, '2026-12-04'), false);
});

test('AC-002.3 filter siapa/status', () => {
  const ts = [T({ siapa: 'A' }), T({ siapa: 'B', status: 'PROGRESS' }), T({ siapa: 'B' })];
  assert.equal(filterTasks(ts, { siapa: 'B' }).length, 2);
  assert.equal(filterTasks(ts, { siapa: 'B', status: 'PROGRESS' }).length, 1);
  assert.equal(filterTasks(ts, {}).length, 3);
});

test('AC-003 who-what: grup per orang, hitung aktif/overdue, sembunyikan selesai', () => {
  const ts = [
    T({ siapa: 'A', selesai: '2026-11-01' }),
    T({ siapa: 'A', status: 'CLOSED' }),
    T({ siapa: 'B', status: 'PROGRESS' }),
  ];
  const g = groupWhoWhat(ts, ['A', 'B', 'C'], '2026-11-11', false);
  assert.deepEqual(g.map((x) => x.nama), ['A', 'B', 'C']);
  assert.equal(g[0].aktif, 1);
  assert.equal(g[0].overdue, 1);
  assert.equal(g[0].list.length, 1);
  assert.equal(g[2].list.length, 0);
  assert.equal(groupWhoWhat(ts, ['A'], '2026-11-11', true)[0].list.length, 2);
});

test('format tanggal', () => {
  assert.equal(fmtDate('2026-11-05'), '5 Nov 26');
  assert.equal(fmtRange('2026-11-05', '2026-11-05'), '5 Nov 26');
  assert.equal(fmtRange('2026-11-05', '2026-12-01'), '5 Nov 26 – 1 Des 26');
});

/* ---------- prioritas & PDF ---------- */
import { byPriority, prioOf } from '../js/util.js';
import { buildListPdf, buildTaskPdf, toWinAnsi, wrap } from '../js/pdf.js';

const mk = (o) => ({ id: 'x', apa: 'Tes', siapa: 'Ahad', mulai: '2026-01-01', selesai: '2026-01-02', status: 'OPEN', catatan: '', created_by: 'Ahad', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', version: 1, ...o });

test('prioritas: default NORMAL, urutan URGENT > HIGH > NORMAL, filter', () => {
  assert.equal(prioOf(mk({})), 'NORMAL');
  assert.equal(prioOf(mk({ prioritas: 'ngawur' })), 'NORMAL');
  const list = [mk({ id: 'n' }), mk({ id: 'u', prioritas: 'URGENT' }), mk({ id: 'h', prioritas: 'HIGH' })].sort(byPriority);
  assert.deepEqual(list.map((t) => t.id), ['u', 'h', 'n']);
  assert.deepEqual(filterTasks(list, { prioritas: 'NORMAL' }).map((t) => t.id), ['n']);
});

function checkPdf(bytes) {
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const xref = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(xref, xref + 4), 'xref');
  const offs = [...s.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  offs.forEach((o, i) => assert.ok(s.slice(o).startsWith(`${i + 1} 0 obj`), `offset objek ${i + 1}`));
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const at = m.index + m[0].length + Number(m[1]);
    assert.equal(s.slice(at, at + 10), '\nendstream');
  }
  return s;
}

test('PDF: daftar multi-halaman & kartu tunggal valid', () => {
  const many = Array.from({ length: 120 }, (_, i) => mk({ id: 'i' + i, apa: `Task ke-${i} (uji) \\ “kutip” – panjang `.repeat(1 + (i % 4)), status: ['OPEN', 'PROGRESS', 'CLOSED'][i % 3], prioritas: ['URGENT', 'HIGH', 'NORMAL'][i % 3] }));
  const s = checkPdf(buildListPdf(many, { today: '2026-02-01' }));
  assert.ok(Number(s.match(/\/Count (\d+)/)[1]) > 1);
  checkPdf(buildListPdf([], { today: '2026-02-01' }));
  checkPdf(buildTaskPdf(mk({ apa: 'Katasangatpanjangtanpaspasi'.repeat(12), catatan: 'baris 1\nbaris 2 📅', prioritas: 'URGENT' }), { today: '2026-02-01' }));
});

test('PDF: teks aman (WinAnsi) & wrap', () => {
  assert.equal(toWinAnsi('a📅b–c日'), 'ab\x96c?');
  assert.ok(wrap('satu dua tiga empat lima enam', 10, false, 40).length > 1);
  assert.equal(wrap('x '.repeat(200), 10, false, 40, 2).length, 2);
});

import { jenisOf, PLAN_STATUSES, ALL_STATUSES } from '../js/util.js';

test('kanban plan: jenis default DOC, filter jenis, aktif/overdue, transisi', () => {
  const plan = mk({ id: 'p', jenis: 'PLAN', status: 'NOTE', catatan: 'tunggu material' });
  const doc = mk({ id: 'd' });
  assert.equal(jenisOf(doc), 'DOC');
  assert.equal(jenisOf(plan), 'PLAN');
  assert.deepEqual(filterTasks([plan, doc], { jenis: 'PLAN' }).map((t) => t.id), ['p']);
  assert.deepEqual(filterTasks([plan, doc], { jenis: 'DOC' }).map((t) => t.id), ['d']);
  assert.ok(isOverdue(plan, '2026-03-01'));
  assert.ok(!isOverdue({ ...plan, status: 'DONE' }, '2026-03-01'));
  assert.ok(canMove('PLAN', 'READY') && canMove('READY', 'DONE') && canMove('NOTE', 'READY') && canMove('DONE', 'PLAN'));
  assert.ok(!canMove('PLAN', 'DONE') && !canMove('PLAN', 'PROGRESS') && !canMove('OPEN', 'READY'));
  assert.equal(ALL_STATUSES.length, PLAN_STATUSES.length + 6);
});

test('PDF: gabungan plan + dokumen, catatan With Note ikut tercetak', () => {
  const s = checkPdf(buildListPdf([mk({ id: 'p', jenis: 'PLAN', status: 'NOTE', catatan: 'tunggu material' }), mk({ id: 'd' })], { today: '2026-02-01' }));
  assert.ok(s.includes('KANBAN PLAN TASK') && s.includes('KANBAN TRACKING DOKUMEN'));
  assert.ok(s.includes('Catatan: tunggu material'));
  assert.ok(checkPdf(buildTaskPdf(mk({ jenis: 'PLAN', status: 'READY' }), { today: '2026-02-01' })).includes('Kartu plan task'));
});
