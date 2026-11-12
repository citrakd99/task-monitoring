import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas-mock.js';

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function boot() {
  const g = loadGas();
  g.ctx.setup();
  g.ctx.upsertUser('Ahad', '1234');
  g.ctx.upsertUser('Budi', '5678');
  g.ctx.upsertUser('Citra', '0000');
  const tok = (n, p) => g.post({ action: 'login', nama: n, pin: p }).data.token;
  return { ...g, A: tok('Ahad', '1234'), B: tok('Budi', '5678'), C: tok('Citra', '0000') };
}

test('users: daftar nama aktif tanpa login', () => {
  const g = boot();
  assert.deepEqual(g.post({ action: 'users' }).data, ['Ahad', 'Budi', 'Citra']);
});

test('login: PIN salah 401, 5x salah dikunci 429, PIN benar tetap terkunci', () => {
  const g = boot();
  for (let i = 0; i < 5; i++) assert.equal(g.post({ action: 'login', nama: 'Budi', pin: '9999' }).code, 401);
  assert.equal(g.post({ action: 'login', nama: 'Budi', pin: '5678' }).code, 429);
});

test('auth: token kosong/palsu/diubah ditolak 401', () => {
  const g = boot();
  assert.equal(g.post({ action: 'list' }).code, 401);
  assert.equal(g.post({ action: 'list', token: 'abc.def' }).code, 401);
  const [p, s] = g.A.split('.');
  const forged = Buffer.from('Budi|' + (Date.now() + 1e9)).toString('base64url') + '.' + s;
  assert.equal(g.post({ action: 'list', token: forged }).code, 401);
  assert.equal(g.post({ action: 'list', token: p + '.' + s }).ok, true);
});

test('auth: user dinonaktifkan -> sesi langsung mati & tidak bisa login', () => {
  const g = boot();
  g.ctx.setUserAktif('Citra', false);
  assert.equal(g.post({ action: 'list', token: g.C }).code, 401);
  assert.equal(g.post({ action: 'login', nama: 'Citra', pin: '0000' }).code, 401);
});

test('AC-001.1 tanggal default = hari ini (WIB)', () => {
  const g = boot();
  const r = g.post({ action: 'create', token: g.A, task: { apa: 'Cek RAB', siapa: 'Budi' } });
  assert.equal(r.ok, true);
  assert.equal(r.data.mulai, TODAY);
  assert.equal(r.data.selesai, TODAY);
  assert.equal(r.data.status, 'OPEN');
  assert.equal(r.data.created_by, 'Ahad');
});

test('AC-001.2 selesai < mulai ditolak; validasi field', () => {
  const g = boot();
  const bad = (task) => g.post({ action: 'create', token: g.A, task });
  assert.equal(bad({ apa: 'x', siapa: 'Budi', mulai: '2026-11-10', selesai: '2026-11-09' }).code, 400);
  assert.equal(bad({ apa: '', siapa: 'Budi' }).code, 400);
  assert.equal(bad({ apa: 'x', siapa: 'Hantu' }).code, 400);
  assert.equal(bad({ apa: 'x', siapa: 'Budi', mulai: '2026-02-30' }).code, 400);
  assert.equal(bad({ apa: 'x'.repeat(501), siapa: 'Budi' }).code, 400);
});

test('AC-001.3 transisi ilegal ditolak 422; alur lengkap + reopen berhasil', () => {
  const g = boot();
  let t = g.post({ action: 'create', token: g.A, task: { apa: 'Gambar shopdrawing', siapa: 'Ahad' } }).data;
  const mv = (to) => g.post({ action: 'move', token: g.A, id: t.id, version: t.version, to });
  assert.equal(mv('SUBMIT').code, 422);
  assert.equal(mv('CLOSED').code, 422);
  for (const to of ['PROGRESS', 'SUBMIT', 'REVISI', 'PROGRESS', 'SUBMIT', 'CLOSED', 'OPEN', 'REJECT', 'OPEN']) {
    const r = mv(to);
    assert.equal(r.ok, true, `ke ${to}: ${r.error}`);
    t = r.data;
  }
  assert.equal(mv('SUBMIT').code, 422); // OPEN -> SUBMIT tetap ilegal
  assert.equal(mv('XYZ').code, 400);
});

test('AC-001.4 konflik versi 409', () => {
  const g = boot();
  const t = g.post({ action: 'create', token: g.A, task: { apa: 'A', siapa: 'Budi' } }).data;
  assert.equal(g.post({ action: 'move', token: g.B, id: t.id, version: t.version, to: 'PROGRESS' }).ok, true);
  const r = g.post({ action: 'move', token: g.A, id: t.id, version: t.version, to: 'REJECT' });
  assert.equal(r.code, 409);
});

test('AC-001.5 setiap perubahan status tercatat di Log', () => {
  const g = boot();
  let t = g.post({ action: 'create', token: g.A, task: { apa: 'Log test', siapa: 'Budi' } }).data;
  t = g.post({ action: 'move', token: g.B, id: t.id, version: t.version, to: 'PROGRESS', note: 'mulai' }).data;
  const log = g.sheets.Log.rows.slice(1).filter((r) => r[1] === t.id);
  assert.equal(log.length, 2);
  assert.deepEqual([...log[1].slice(2)], ['Budi', 'OPEN', 'PROGRESS', 'mulai']);
});

test('AC-001.7 bukan pelaksana/pembuat -> 403 (move & update)', () => {
  const g = boot();
  const t = g.post({ action: 'create', token: g.A, task: { apa: 'Milik A & B', siapa: 'Budi' } }).data;
  assert.equal(g.post({ action: 'move', token: g.C, id: t.id, version: t.version, to: 'PROGRESS' }).code, 403);
  assert.equal(g.post({ action: 'update', token: g.C, id: t.id, version: t.version, task: { apa: 'hack' } }).code, 403);
  assert.equal(g.post({ action: 'list', token: g.C }).data.tasks.length, 1); // tetap boleh lihat
});

test('AC-001.8 pembuat (bukan pelaksana) boleh set REVISI; pelaksana boleh SUBMIT', () => {
  const g = boot();
  let t = g.post({ action: 'create', token: g.A, task: { apa: 'Laporan', siapa: 'Budi' } }).data;
  t = g.post({ action: 'move', token: g.B, id: t.id, version: t.version, to: 'PROGRESS' }).data;
  t = g.post({ action: 'move', token: g.B, id: t.id, version: t.version, to: 'SUBMIT' }).data;
  const r = g.post({ action: 'move', token: g.A, id: t.id, version: t.version, to: 'REVISI', note: 'kurang lampiran' });
  assert.equal(r.ok, true);
  assert.equal(r.data.status, 'REVISI');
});

test('update: edit field, task final terkunci, pindah tangan tercatat', () => {
  const g = boot();
  let t = g.post({ action: 'create', token: g.A, task: { apa: 'Awal', siapa: 'Ahad' } }).data;
  const r = g.post({ action: 'update', token: g.A, id: t.id, version: t.version, task: { apa: 'Diubah', siapa: 'Citra', selesai: '2099-01-01' } });
  assert.equal(r.ok, true);
  assert.equal(r.data.apa, 'Diubah');
  assert.equal(r.data.version, 2);
  assert.ok(g.sheets.Log.rows.some((x) => String(x[5]).includes('Ahad -> Citra')));
  t = g.post({ action: 'move', token: g.A, id: t.id, version: 2, to: 'REJECT' }).data;
  assert.equal(g.post({ action: 'update', token: g.A, id: t.id, version: t.version, task: { apa: 'x' } }).code, 422);
});

test('keamanan: formula injection disimpan sebagai teks & terbaca utuh', () => {
  const g = boot();
  const evil = '=IMPORTXML("http://x","//a")';
  const t = g.post({ action: 'create', token: g.A, task: { apa: evil, siapa: 'Ahad', catatan: '+62 812' } }).data;
  const list = g.post({ action: 'list', token: g.A }).data.tasks;
  const got = list.find((x) => x.id === t.id);
  assert.equal(got.apa, evil);
  assert.equal(got.catatan, '+62 812');
  assert.equal(got.mulai, TODAY);
});

test('server: action tidak dikenal 400, body rusak 400', () => {
  const g = boot();
  assert.equal(g.post({ action: 'drop', token: g.A }).code, 400);
  const raw = JSON.parse(g.ctx.doPost({ postData: { contents: '{bad' } }).s);
  assert.equal(raw.code, 400);
});

test('upsertUser: reset PIN, validasi PIN', () => {
  const g = boot();
  g.ctx.upsertUser('ahad', '4321'); // case-insensitive -> update
  assert.equal(g.post({ action: 'login', nama: 'Ahad', pin: '4321' }).ok, true);
  assert.equal(g.sheets.Users.rows.length, 4);
  assert.throws(() => g.ctx.upsertUser('Dodi', '12'));
});

test('prioritas: default NORMAL, tersimpan, validasi, bisa diubah', () => {
  const g = loadGas();
  g.ctx.setup();
  g.ctx.upsertUser('Ahad', '1234');
  const token = g.post({ action: 'login', nama: 'Ahad', pin: '1234' }).data.token;
  const base = { apa: 'Tes prioritas', siapa: 'Ahad', mulai: '2026-01-01', selesai: '2026-01-02' };
  const a = g.post({ action: 'create', token, task: base }).data;
  assert.equal(a.prioritas, 'NORMAL');
  const b = g.post({ action: 'create', token, task: { ...base, prioritas: 'urgent' } }).data;
  assert.equal(b.prioritas, 'URGENT');
  assert.equal(g.post({ action: 'create', token, task: { ...base, prioritas: 'SUPER' } }).code, 400);
  const up = g.post({ action: 'update', token, id: a.id, version: a.version, task: { prioritas: 'HIGH' } }).data;
  assert.equal(up.prioritas, 'HIGH');
  const list = g.post({ action: 'list', token }).data.tasks;
  assert.deepEqual(list.map((t) => t.prioritas).sort(), ['HIGH', 'URGENT']);
});

test('kanban Plan Task: status awal, transisi, With Note wajib catatan, terpisah dari dokumen', () => {
  const g = loadGas();
  g.ctx.setup();
  g.ctx.upsertUser('Ahad', '1234');
  const token = g.post({ action: 'login', nama: 'Ahad', pin: '1234' }).data.token;
  const base = { apa: 'Nyanting batch 1', siapa: 'Ahad', mulai: '2026-01-01', selesai: '2026-01-05' };
  const doc = g.post({ action: 'create', token, task: base }).data;
  assert.equal(doc.jenis, 'DOC');
  assert.equal(doc.status, 'OPEN');
  let p = g.post({ action: 'create', token, task: { ...base, jenis: 'plan' } }).data;
  assert.equal(p.jenis, 'PLAN');
  assert.equal(p.status, 'PLAN');
  assert.equal(g.post({ action: 'create', token, task: { ...base, jenis: 'LAIN' } }).code, 400);
  const mv = (t, to, note) => g.post({ action: 'move', token, id: t.id, version: t.version, to, note });
  assert.equal(mv(p, 'PROGRESS').code, 422); // status dokumen tidak berlaku untuk plan
  assert.equal(mv(doc, 'READY').code, 422); // dan sebaliknya
  assert.equal(mv(p, 'DONE').code, 422); // harus Ready dulu
  assert.equal(mv(p, 'NOTE', '').code, 400); // With Note wajib catatan
  p = mv(p, 'NOTE', 'Material belum datang').data;
  assert.equal(p.status, 'NOTE');
  assert.equal(p.catatan, 'Material belum datang');
  p = mv(p, 'READY').data;
  assert.equal(p.catatan, 'Material belum datang'); // catatan tidak hilang
  p = mv(p, 'DONE').data;
  assert.equal(g.post({ action: 'update', token, id: p.id, version: p.version, task: { apa: 'x' } }).code, 422);
  p = mv(p, 'PLAN').data; // reopen
  const up = g.post({ action: 'update', token, id: p.id, version: p.version, task: { apa: 'Nyanting batch 2', jenis: 'DOC' } }).data;
  assert.equal(up.jenis, 'PLAN'); // jenis tidak bisa diubah
  const list = g.post({ action: 'list', token }).data.tasks;
  assert.deepEqual(list.map((t) => t.jenis).sort(), ['DOC', 'PLAN']);
});

test('mode pribadi: PIC bebas, hanya pemilik yang melihat & mengubah', () => {
  const g = loadGas();
  g.ctx.setup();
  g.ctx.upsertUser('Ahad', '1234');
  g.ctx.upsertUser('Budi', '5678');
  const ahad = g.post({ action: 'login', nama: 'Ahad', pin: '1234' }).data.token;
  const budi = g.post({ action: 'login', nama: 'Budi', pin: '5678' }).data.token;
  const base = { apa: 'Pasang rak', mulai: '2026-01-01', selesai: '2026-01-05' };
  // mode tim tetap menolak PIC di luar daftar user
  assert.equal(g.post({ action: 'create', token: ahad, task: { ...base, siapa: 'Pak Joko' } }).code, 400);
  let t = g.post({ action: 'create', token: ahad, task: { ...base, siapa: 'Pak Joko', pribadi: true, jenis: 'PLAN' } }).data;
  assert.equal(t.pemilik, 'Ahad');
  assert.equal(t.siapa, 'Pak Joko');
  assert.equal(g.post({ action: 'create', token: ahad, task: { ...base, siapa: '', pribadi: true } }).code, 400);
  assert.equal(g.post({ action: 'create', token: ahad, task: { ...base, siapa: 'x'.repeat(51), pribadi: true } }).code, 400);
  const tim = g.post({ action: 'create', token: ahad, task: { ...base, siapa: 'Budi' } }).data;
  assert.equal(tim.pemilik, '');
  const ids = (token) => g.post({ action: 'list', token }).data.tasks.map((x) => x.id).sort();
  assert.deepEqual(ids(ahad), [t.id, tim.id].sort());
  assert.deepEqual(ids(budi), [tim.id]); // Budi tidak melihat task pribadi Ahad
  assert.equal(g.post({ action: 'move', token: budi, id: t.id, version: t.version, to: 'READY' }).code, 404);
  assert.equal(g.post({ action: 'update', token: budi, id: t.id, version: t.version, task: { apa: 'x' } }).code, 404);
  t = g.post({ action: 'update', token: ahad, id: t.id, version: t.version, task: { siapa: 'Vendor Kain Solo' } }).data;
  assert.equal(t.siapa, 'Vendor Kain Solo');
  assert.equal(t.pemilik, 'Ahad');
  t = g.post({ action: 'move', token: ahad, id: t.id, version: t.version, to: 'READY' }).data;
  assert.equal(t.status, 'READY');
});
