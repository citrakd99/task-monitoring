// Server PREVIEW lokal — hanya untuk mencoba tampilan, BUKAN untuk produksi.
// Menyajikan file statis + API tiruan (Code.gs dijalankan lewat simulator tests/gas-mock.js)
// dengan data demo di memori. Data hilang setiap server dimatikan.
//
//   npm run preview   ->  http://localhost:4173
//
// Login demo: pilih nama mana saja, PIN = DEMO_PIN di bawah.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGas } from '../tests/gas-mock.js';

const PORT = Number(process.env.PORT) || 4173;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_PATH = '/__api';
const DEMO_PIN = '1234';
const DEMO_USERS = ['Ahad', 'Budi', 'Citra', 'Dewi', 'Eko'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

/* ---------------- data demo ---------------- */

const gas = loadGas();
gas.ctx.setup();
DEMO_USERS.forEach((n) => gas.ctx.upsertUser(n, DEMO_PIN));

const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

// [apa, siapa, mulai(offset hari), selesai(offset hari), jalur status, catatan, prioritas]
const SEED = [
  ['Desain motif parang untuk koleksi Januari', 'Ahad', -2, 4, [], 'Referensi ada di folder Drive', 'HIGH'],
  ['Foto produk batik tulis seri pesisir', 'Budi', 0, 2, [], ''],
  ['Rekap stok kain mori & malam', 'Citra', -6, -1, [], 'Belum mulai, menunggu data gudang', 'URGENT'],
  ['Pewarnaan batch #12 (indigo)', 'Dewi', -3, 3, ['PROGRESS'], ''],
  ['Update katalog marketplace', 'Eko', -1, 5, ['PROGRESS'], '40 SKU baru'],
  ['Perbaikan canting cap rusak', 'Budi', -8, -2, ['PROGRESS'], 'Tunggu sparepart', 'URGENT'],
  ['Laporan penjualan Oktober', 'Citra', -5, 1, ['PROGRESS', 'SUBMIT'], ''],
  ['Sampel seragam batik untuk klien korporat', 'Ahad', -7, 0, ['PROGRESS', 'SUBMIT'], '3 pilihan warna', 'HIGH'],
  ['Revisi label harga & hangtag', 'Dewi', -4, 2, ['PROGRESS', 'SUBMIT', 'REVISI'], 'Logo kurang besar'],
  ['Konten Instagram minggu ini', 'Eko', -3, 1, ['PROGRESS', 'SUBMIT', 'REVISI'], ''],
  ['Kirim pesanan pameran Jakarta', 'Budi', -10, -4, ['PROGRESS', 'SUBMIT', 'CLOSED'], ''],
  ['Pelatihan pembatik baru (gelombang 2)', 'Ahad', -14, -7, ['PROGRESS', 'SUBMIT', 'CLOSED'], ''],
  ['Kerja sama reseller luar kota', 'Citra', -9, -3, ['REJECT'], 'Margin tidak masuk'],
  ['Persiapan stan bazar akhir tahun', 'Dewi', 6, 12, [], ''],
  ['Stock opname gudang', 'Eko', 9, 10, [], ''],
];

const tokens = {};
const tokenOf = (nama) => (tokens[nama] ||= gas.post({ action: 'login', nama, pin: DEMO_PIN }).data.token);

for (const [apa, siapa, a, b, steps, catatan, prioritas = 'NORMAL'] of SEED) {
  const token = tokenOf(siapa);
  let t = gas.post({ action: 'create', token, task: { apa, siapa, mulai: day(a), selesai: day(b), catatan, prioritas } }).data;
  for (const to of steps) t = gas.post({ action: 'move', token, id: t.id, version: t.version, to, note: '' }).data;
}

/* ---------------- http ---------------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > 1e6) reject(new Error('body terlalu besar'));
    });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

const send = (res, code, type, body) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === API_PATH && req.method === 'POST') {
        const out = gas.ctx.doPost({ postData: { contents: await readBody(req) } }).s;
        return send(res, 200, MIME['.json'], out);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'Method not allowed');
      // Arahkan frontend ke API tiruan tanpa mengubah js/config.js yang asli.
      if (url.pathname === '/js/config.js') return send(res, 200, MIME['.js'], `export const API_URL = '${API_PATH}';\n`);

      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(ROOT, '.' + rel);
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'text/plain', 'Forbidden');
      const type = MIME[path.extname(file).toLowerCase()];
      if (!type || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'text/plain', 'Not found');
      send(res, 200, type, fs.readFileSync(file));
    } catch (e) {
      send(res, 500, 'text/plain', String(e && e.message));
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`Preview Task MonitorinG: http://localhost:${PORT}`);
    console.log(`Login demo: ${DEMO_USERS.join(', ')} — PIN ${DEMO_PIN} (data di memori, bukan data asli)`);
  });
