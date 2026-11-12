/**
 * Task MonitorinG — Backend API (Google Apps Script, V8)
 * File ID: F10 | Revision: R3 (prioritas + kanban Plan Task)
 *
 * Script ini harus "container-bound": buka Spreadsheet > Extensions > Apps Script,
 * lalu tempel seluruh isi file ini ke Code.gs.
 */

const CFG = {
  TZ: 'Asia/Jakarta',
  TOKEN_TTL_MS: 12 * 60 * 60 * 1000, // sesi 12 jam
  MAX_FAIL: 5,                        // salah PIN maksimal
  LOCK_SEC: 15 * 60,                  // dikunci 15 menit
  MAX_APA: 500,
  MAX_CATATAN: 1000,
  MAX_NOTE: 500,
};

const SH = { TASKS: 'Tasks', USERS: 'Users', LOG: 'Log', ERR: 'ErrorLog' };

const HEAD = {
  Tasks: ['id', 'apa', 'siapa', 'mulai', 'selesai', 'status', 'catatan', 'created_by', 'created_at', 'updated_at', 'version', 'prioritas', 'jenis'],
  Users: ['nama', 'pin_hash', 'salt', 'role', 'aktif'],
  Log: ['ts', 'task_id', 'user', 'from_status', 'to_status', 'note'],
  ErrorLog: ['ts', 'action', 'message', 'stack'],
};

// jenis DOC = kanban tracking dokumen, jenis PLAN = kanban plan task pekerjaan.
// Nama status kedua kanban sengaja berbeda, jadi satu tabel transisi cukup.
const JENIS = ['DOC', 'PLAN'];
const FIRST = { DOC: 'OPEN', PLAN: 'PLAN' };
const STATUSES = ['OPEN', 'PROGRESS', 'SUBMIT', 'REVISI', 'CLOSED', 'REJECT', 'PLAN', 'READY', 'NOTE', 'DONE'];
const FINAL = ['CLOSED', 'REJECT', 'DONE'];
const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL'];
const TRANSITIONS = {
  OPEN: ['PROGRESS', 'REJECT'],
  PROGRESS: ['SUBMIT'],
  SUBMIT: ['CLOSED', 'REVISI', 'REJECT'],
  REVISI: ['PROGRESS'],
  CLOSED: ['OPEN'], // reopen
  REJECT: ['OPEN'], // reopen
  PLAN: ['READY', 'NOTE'],
  READY: ['DONE', 'NOTE', 'PLAN'],
  NOTE: ['READY', 'DONE', 'PLAN'], // Plan Task With Note
  DONE: ['PLAN'], // reopen
};

/* ======================= HTTP ======================= */

function doGet() {
  return json_({ ok: true, data: { app: 'Task MonitorinG', time: new Date().toISOString() } });
}

function doPost(e) {
  let body = {};
  try {
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (_) {
      fail_(400, 'Request tidak valid');
    }
    return json_({ ok: true, data: route_(body) });
  } catch (err) {
    if (err && err.isPublic) return json_({ ok: false, code: err.code, error: err.message });
    logError_(body.action, err);
    return json_({ ok: false, code: 500, error: 'Terjadi kesalahan di server' });
  }
}

function route_(b) {
  switch (b.action) {
    case 'users': return listUsers_();
    case 'login': return login_(b.nama, b.pin);
  }
  const me = auth_(b.token);
  switch (b.action) {
    case 'list': return { tasks: readTasks_(), today: today_() };
    case 'create': return withLock_(() => createTask_(me, b.task));
    case 'update': return withLock_(() => updateTask_(me, b.id, b.version, b.task));
    case 'move': return withLock_(() => moveTask_(me, b.id, b.version, b.to, b.note));
    default: fail_(400, 'Action tidak dikenal');
  }
}

/* ======================= TASKS ======================= */

function createTask_(me, input) {
  const t = cleanTask_(input, activeNames_(), null);
  const now = new Date().toISOString();
  t.id = Utilities.getUuid();
  t.jenis = str_(input && input.jenis).toUpperCase() || 'DOC';
  if (JENIS.indexOf(t.jenis) < 0) fail_(400, 'Jenis kanban harus DOC atau PLAN');
  t.status = FIRST[t.jenis];
  t.created_by = me;
  t.created_at = now;
  t.updated_at = now;
  t.version = 1;
  sheet_(SH.TASKS).appendRow(taskToRow_(t));
  log_(t.id, me, '', t.status, 'dibuat');
  return t;
}

function updateTask_(me, id, version, input) {
  const f = findTask_(id);
  assertOwner_(me, f.task);
  assertVersion_(f.task, version);
  if (FINAL.indexOf(f.task.status) >= 0) fail_(422, 'Task yang sudah Closed/Reject tidak bisa diedit. Reopen dulu.');
  const clean = cleanTask_(input, activeNames_(), f.task);
  const t = Object.assign({}, f.task, clean, {
    updated_at: new Date().toISOString(),
    version: f.task.version + 1,
  });
  writeTask_(f.row, t);
  if (f.task.siapa !== t.siapa) log_(t.id, me, t.status, t.status, 'pindah tangan: ' + f.task.siapa + ' -> ' + t.siapa);
  return t;
}

function moveTask_(me, id, version, to, note) {
  const f = findTask_(id);
  assertOwner_(me, f.task);
  assertVersion_(f.task, version);
  to = str_(to).toUpperCase();
  if (STATUSES.indexOf(to) < 0) fail_(400, 'Status tujuan tidak dikenal');
  const from = f.task.status;
  if ((TRANSITIONS[from] || []).indexOf(to) < 0) fail_(422, 'Transisi ' + from + ' -> ' + to + ' tidak diizinkan');
  note = str_(note);
  if (note.length > CFG.MAX_NOTE) fail_(400, 'Catatan perubahan maksimal ' + CFG.MAX_NOTE + ' karakter');
  if (to === 'NOTE' && !note) fail_(400, 'Plan Task With Note wajib diisi catatan');
  const t = Object.assign({}, f.task, {
    status: to,
    catatan: to === 'NOTE' ? note : f.task.catatan,
    updated_at: new Date().toISOString(),
    version: f.task.version + 1,
  });
  writeTask_(f.row, t);
  log_(t.id, me, from, to, note);
  return t;
}

function cleanTask_(input, users, base) {
  input = input || {};
  const pick = (k) => (input[k] !== undefined ? input[k] : base ? base[k] : undefined);
  const today = today_();
  const t = {
    apa: str_(pick('apa')),
    siapa: str_(pick('siapa')),
    mulai: str_(pick('mulai')) || today,
    selesai: str_(pick('selesai')) || today,
    catatan: str_(pick('catatan')),
    prioritas: str_(pick('prioritas')).toUpperCase() || 'NORMAL',
  };
  if (PRIORITIES.indexOf(t.prioritas) < 0) fail_(400, 'Prioritas harus URGENT, HIGH, atau NORMAL');
  if (!t.apa) fail_(400, 'Apa (isi task) wajib diisi');
  if (t.apa.length > CFG.MAX_APA) fail_(400, 'Apa maksimal ' + CFG.MAX_APA + ' karakter');
  if (t.catatan.length > CFG.MAX_CATATAN) fail_(400, 'Catatan maksimal ' + CFG.MAX_CATATAN + ' karakter');
  const keepOld = base && base.siapa === t.siapa; // user lama yg sudah nonaktif tetap boleh
  if (users.indexOf(t.siapa) < 0 && !keepOld) fail_(400, 'Siapa tidak terdaftar / tidak aktif');
  if (!isDate_(t.mulai) || !isDate_(t.selesai)) fail_(400, 'Format tanggal harus YYYY-MM-DD');
  if (t.selesai < t.mulai) fail_(400, 'Tanggal selesai tidak boleh sebelum tanggal mulai');
  return t;
}

function assertOwner_(me, task) {
  if (task.siapa !== me && task.created_by !== me) fail_(403, 'Bukan task Anda (hanya pelaksana atau pembuat yang boleh mengubah)');
}

function assertVersion_(task, version) {
  if (Number(version) !== task.version) fail_(409, 'Task sudah diubah orang lain. Data dimuat ulang.');
}

function readTasks_() {
  const v = sheet_(SH.TASKS).getDataRange().getValues();
  v.shift();
  const out = [];
  v.forEach((r) => {
    if (str_(r[0])) out.push(rowToTask_(r));
  });
  return out;
}

function findTask_(id) {
  id = str_(id);
  if (!id) fail_(400, 'ID task kosong');
  const v = sheet_(SH.TASKS).getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (str_(v[i][0]) === id) return { row: i + 1, task: rowToTask_(v[i]) };
  }
  fail_(404, 'Task tidak ditemukan');
}

function writeTask_(row, t) {
  sheet_(SH.TASKS).getRange(row, 1, 1, HEAD.Tasks.length).setValues([taskToRow_(t)]);
}

function rowToTask_(r) {
  const o = {};
  HEAD.Tasks.forEach((h, i) => {
    const v = r[i];
    if (h === 'mulai' || h === 'selesai') o[h] = normDate_(v);
    else if (h === 'version') o[h] = Number(v) || 1;
    else if (h === 'prioritas') o[h] = PRIORITIES.indexOf(str_(v).toUpperCase()) >= 0 ? str_(v).toUpperCase() : 'NORMAL'; // baris lama = NORMAL
    else if (h === 'jenis') o[h] = str_(v).toUpperCase() === 'PLAN' ? 'PLAN' : 'DOC'; // baris lama = DOC
    else o[h] = v instanceof Date ? v.toISOString() : str_(v);
  });
  return o;
}

function taskToRow_(t) {
  return HEAD.Tasks.map((h) => (h === 'version' ? Number(t.version) : safe_(t[h] == null ? '' : t[h])));
}

/* ======================= AUTH ======================= */

function listUsers_() {
  return readUsers_().filter((u) => u.aktif).map((u) => u.nama).sort();
}

function activeNames_() {
  return listUsers_();
}

function readUsers_() {
  const v = sheet_(SH.USERS).getDataRange().getValues();
  v.shift();
  return v
    .filter((r) => str_(r[0]))
    .map((r) => ({
      nama: str_(r[0]),
      pin_hash: str_(r[1]),
      salt: str_(r[2]),
      role: str_(r[3]) || 'member',
      aktif: r[4] === true || str_(r[4]).toUpperCase() === 'TRUE',
    }));
}

function login_(nama, pin) {
  nama = str_(nama);
  pin = str_(pin);
  if (!nama || !pin) fail_(400, 'Nama dan PIN wajib diisi');
  const cache = CacheService.getScriptCache();
  const key = 'fail_' + nama.toLowerCase();
  const n = Number(cache.get(key) || 0);
  if (n >= CFG.MAX_FAIL) fail_(429, 'Terlalu banyak percobaan salah. Coba lagi dalam 15 menit.');
  const u = readUsers_().filter((x) => x.nama.toLowerCase() === nama.toLowerCase() && x.aktif)[0];
  if (!u || !safeEq_(hash_(u.salt, pin), u.pin_hash)) {
    cache.put(key, String(n + 1), CFG.LOCK_SEC);
    fail_(401, 'Nama atau PIN salah');
  }
  cache.remove(key);
  const exp = Date.now() + CFG.TOKEN_TTL_MS;
  return { token: signToken_(u.nama, exp), nama: u.nama, role: u.role, exp: exp };
}

function signToken_(nama, exp) {
  const payload = nama + '|' + exp;
  const sig = hex_(Utilities.computeHmacSha256Signature(payload, secret_()));
  return Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + sig;
}

function auth_(token) {
  const bad = () => fail_(401, 'Sesi berakhir, silakan login ulang');
  token = str_(token);
  const parts = token.split('.');
  if (parts.length !== 2) bad();
  let payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  } catch (_) {
    bad();
  }
  const sig = hex_(Utilities.computeHmacSha256Signature(payload, secret_()));
  if (!safeEq_(sig, parts[1])) bad();
  const i = payload.lastIndexOf('|');
  const nama = payload.slice(0, i);
  const exp = Number(payload.slice(i + 1));
  if (!exp || exp < Date.now()) bad();
  if (listUsers_().indexOf(nama) < 0) bad(); // user dinonaktifkan -> sesi mati
  return nama;
}

function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!s) fail_(500, 'Server belum di-setup. Jalankan menu "Setup awal".');
  return s;
}

function hash_(salt, pin) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pin, Utilities.Charset.UTF_8));
}

/* ======================= ADMIN (menu spreadsheet) ======================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Task MonitorinG')
    .addItem('1. Setup awal', 'setup')
    .addItem('2. Tambah user / reset PIN', 'menuUpsertUser')
    .addItem('3. Nonaktifkan user', 'menuNonaktifUser')
    .addToUi();
}

function setup() {
  const ss = ss_();
  Object.keys(HEAD).forEach((name) => {
    const s = ss.getSheetByName(name) || ss.insertSheet(name);
    s.getRange(1, 1, s.getMaxRows(), HEAD[name].length).setNumberFormat('@');
    s.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]).setFontWeight('bold');
    s.setFrozenRows(1);
  });
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  // Pakai toast (tidak menunggu klik). alert() dari editor menggantung sampai
  // "Melebihi jumlah eksekusi maksimum" karena dialognya muncul di tab spreadsheet.
  try {
    ss.toast('Setup selesai. Lanjut: menu "Task MonitorinG > 2. Tambah user / reset PIN".', 'Task MonitorinG', 10);
  } catch (_) { /* tanpa UI */ }
  console.log('Setup selesai.');
}

function menuUpsertUser() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('Tambah user / reset PIN', 'Nama user (unik, maks 50 karakter):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const nama = r1.getResponseText().trim();
  const r2 = ui.prompt('PIN untuk ' + nama, 'PIN 4–8 digit angka:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  try {
    const res = upsertUser(nama, r2.getResponseText().trim());
    ui.alert('User "' + nama + '" ' + (res === 'created' ? 'ditambahkan.' : 'diperbarui (PIN direset & diaktifkan).'));
  } catch (e) {
    ui.alert('Gagal: ' + e.message);
  }
}

function menuNonaktifUser() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Nonaktifkan user', 'Nama user:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  try {
    setUserAktif(r.getResponseText().trim(), false);
    ui.alert('User dinonaktifkan. Sesi login-nya langsung tidak berlaku.');
  } catch (e) {
    ui.alert('Gagal: ' + e.message);
  }
}

function upsertUser(nama, pin, role) {
  nama = str_(nama);
  pin = str_(pin);
  if (!nama || nama.length > 50 || /^[=+\-@]/.test(nama) || nama.indexOf('|') >= 0) fail_(400, 'Nama tidak valid');
  if (!/^\d{4,8}$/.test(pin)) fail_(400, 'PIN harus 4–8 digit angka');
  const salt = Utilities.getUuid();
  const s = sheet_(SH.USERS);
  const v = s.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (str_(v[i][0]).toLowerCase() === nama.toLowerCase()) {
      const row = [str_(v[i][0]), hash_(salt, pin), salt, str_(v[i][3]) || role || 'member', 'TRUE'];
      s.getRange(i + 1, 1, 1, 5).setValues([row.map(safe_)]);
      return 'updated';
    }
  }
  s.appendRow([nama, hash_(salt, pin), salt, role || 'member', 'TRUE'].map(safe_));
  return 'created';
}

function setUserAktif(nama, aktif) {
  const s = sheet_(SH.USERS);
  const v = s.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (str_(v[i][0]).toLowerCase() === str_(nama).toLowerCase()) {
      s.getRange(i + 1, 5).setValues([[aktif ? 'TRUE' : 'FALSE']]);
      return;
    }
  }
  fail_(404, 'User tidak ditemukan');
}

/* ======================= UTIL ======================= */

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) fail_(500, 'Sheet "' + name + '" belum ada. Jalankan menu "Setup awal".');
  return s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) fail_(503, 'Server sibuk, coba lagi sebentar');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function log_(taskId, user, from, to, note) {
  sheet_(SH.LOG).appendRow([new Date().toISOString(), taskId, user, from, to, note || ''].map(safe_));
}

function logError_(action, err) {
  try {
    sheet_(SH.ERR).appendRow([new Date().toISOString(), str_(action), str_(err && err.message), str_(err && err.stack).slice(0, 2000)].map(safe_));
  } catch (_) { /* jangan sampai logging bikin crash */ }
}

function fail_(code, msg) {
  const e = new Error(msg);
  e.code = code;
  e.isPublic = true;
  throw e;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function str_(v) {
  return v == null ? '' : String(v).trim();
}

/** Paksa simpan sebagai teks: cegah formula injection & auto-konversi tanggal/angka. */
function safe_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@0-9']/.test(v) ? "'" + v : v;
}

function today_() {
  return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return str_(v);
}

function isDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function hex_(bytes) {
  return bytes.map((b) => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

function safeEq_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
