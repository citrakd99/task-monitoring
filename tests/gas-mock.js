// Simulator Google Apps Script (SpreadsheetApp, Utilities, Cache, Lock, Properties, ContentService)
// untuk menguji apps-script/Code.gs secara lokal dengan Node.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const signed = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));
const store = (v) => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v); // perilaku Sheets: apostrof = paksa teks

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  width() { return Math.max(1, ...this.rows.map((r) => r.length)); }
  getDataRange() {
    const w = this.width();
    return { getValues: () => (this.rows.length ? this.rows : [[]]).map((r) => Array.from({ length: w }, (_, i) => (r[i] === undefined ? '' : r[i]))) };
  }
  appendRow(a) { this.rows.push(a.map(store)); }
  getMaxRows() { return 1000; }
  setFrozenRows() {}
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    const range = {
      setValues(vals) {
        vals.forEach((row, i) => row.forEach((v, j) => {
          while (sh.rows.length < r + i) sh.rows.push([]);
          sh.rows[r + i - 1][c + j - 1] = store(v);
        }));
        return range;
      },
      setNumberFormat() { return range; },
      setFontWeight() { return range; },
    };
    return range;
  }
}

export function loadGas() {
  const sheets = {};
  const cache = new Map();
  const props = new Map();
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = new Sheet(n)),
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
  };
  const ctx = {
    console,
    Date,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => { throw new Error('no ui'); } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, s) => signed(crypto.createHash('sha256').update(s, 'utf8').digest()),
      computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', k).update(v, 'utf8').digest()),
      base64EncodeWebSafe: (s) => Buffer.from(s, 'utf8').toString('base64url'),
      base64DecodeWebSafe: (s) => {
        if (!/^[A-Za-z0-9_\-=]+$/.test(s)) throw new Error('bad b64');
        return signed(Buffer.from(s, 'base64url'));
      },
      newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString('utf8') }),
      formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
    },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  return { ctx, sheets, cache, post };
}
