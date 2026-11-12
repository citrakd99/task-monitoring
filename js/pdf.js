// File ID: F14 | Revision: R2 — export PDF tanpa library (PDF 1.4, font standar Helvetica)
import { STATUS_META, PRIORITY_META, JENIS_META, jenisOf, prioOf, byPriority, isOverdue, fmtDate, fmtRange } from './util.js';

const W = 595.28;
const H = 841.89;
const M = 40;
const BRAND = '#1e3a8a';
const INK = '#0f172a';
const MUTE = '#64748b';
const LINE = '#e2e8f0';
const RED = '#dc2626';

const CP1252 = { 0x20ac: 0x80, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97 };
const SPACES = [0x09, 0x2009, 0x200a, 0x202f, 0x2007];
const DROP = [0xfe0f, 0x200d, 0x200b, 0x0d];

/** Ubah teks ke WinAnsi (1 byte/karakter). Emoji dibuang, karakter lain di luar Latin jadi "?". */
export function toWinAnsi(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    const c = ch.codePointAt(0);
    if (c === 0x0a) out += '\n';
    else if (SPACES.includes(c)) out += ' ';
    else if (DROP.includes(c) || c > 0xffff || (c >= 0x2600 && c <= 0x27bf)) continue;
    else if (c < 0x20) out += ' ';
    else if (c <= 0x7e || (c >= 0xa0 && c <= 0xff)) out += ch;
    else if (CP1252[c]) out += String.fromCharCode(CP1252[c]);
    else out += '?';
  }
  return out;
}

const pdfStr = (s) => {
  let out = '(';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x5c || c === 0x28 || c === 0x29) out += '\\' + s[i];
    else if (c < 0x20 || c > 0x7e) out += '\\' + c.toString(8).padStart(3, '0');
    else out += s[i];
  }
  return out + ')';
};

const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
const n2 = (n) => Number(n).toFixed(2);

// Lebar teks: di browser diukur lewat canvas (Arial ~ Helvetica); di luar browser pakai perkiraan.
let measure = (s, size, bold) => s.length * size * (bold ? 0.6 : 0.56);
if (typeof document !== 'undefined') {
  try {
    const c = document.createElement('canvas').getContext('2d');
    if (c) {
      measure = (s, size, bold) => {
        c.font = `${bold ? 'bold ' : ''}${size}px Arial, Helvetica, sans-serif`;
        return c.measureText(s).width * 1.05;
      };
    }
  } catch { /* pakai perkiraan */ }
}

export function wrap(text, size, bold, maxW, maxLines = Infinity) {
  const lines = [];
  for (const para of toWinAnsi(text).split('\n')) {
    let cur = '';
    for (let word of para.split(' ').filter(Boolean)) {
      while (measure(word, size, bold) > maxW) { // kata lebih panjang dari kolom: potong per karakter
        if (cur) { lines.push(cur); cur = ''; }
        let k = word.length - 1;
        while (k > 1 && measure(word.slice(0, k), size, bold) > maxW) k--;
        lines.push(word.slice(0, k));
        word = word.slice(k);
      }
      const next = cur ? cur + ' ' + word : word;
      if (cur && measure(next, size, bold) > maxW) { lines.push(cur); cur = word; } else cur = next;
    }
    lines.push(cur);
  }
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, '...');
  }
  return lines;
}

class Doc {
  constructor() {
    this.pages = [];
    this.newPage();
  }
  newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = H - M;
  }
  /** true jika pindah halaman */
  need(h) {
    if (this.y - h >= M + 24) return false;
    this.newPage();
    return true;
  }
  rect(x, y, w, h, color) {
    this.ops.push(`${rgb(color)} rg ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`);
  }
  text(s, x, y, size, { bold = false, color = INK, raw = false } = {}) {
    const str = raw ? s : toWinAnsi(s).replace(/\n/g, ' ');
    if (!str) return 0;
    this.ops.push(`BT /F${bold ? 2 : 1} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${n2(x)} ${n2(y)} Tm ${pdfStr(str)} Tj ET`);
    return measure(str, size, bold);
  }
  /** kotak label berwarna, mengembalikan lebarnya */
  badge(label, x, y, color) {
    const s = toWinAnsi(label);
    const w = measure(s, 8, true) + 12;
    this.rect(x, y - 4, w, 14, color);
    this.text(s, x + 6, y, 8, { bold: true, color: '#ffffff', raw: true });
    return w;
  }
  build(footer) {
    const total = this.pages.length;
    this.pages.forEach((ops, i) => {
      this.ops = ops;
      this.rect(M, M + 8, W - 2 * M, 0.6, LINE);
      this.text(footer, M, M - 4, 8, { color: MUTE });
      const p = `Halaman ${i + 1} / ${total}`;
      this.text(p, W - M - measure(p, 8, false), M - 4, 8, { color: MUTE });
    });
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      `<< /Type /Pages /Count ${total} /Kids [${this.pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ];
    this.pages.forEach((ops, i) => {
      const stream = ops.join('\n');
      objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
      objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = objs.map((o, i) => {
      const at = out.length;
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
      return at;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

function header(doc, subtitle) {
  doc.rect(0, H - 72, W, 72, BRAND);
  doc.text('Task MonitorinG', M, H - 36, 18, { bold: true, color: '#ffffff' });
  doc.text(subtitle, M, H - 54, 10, { color: '#dbeafe' });
  doc.y = H - 96;
}

const stamp = (d = new Date()) => {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [date, time] = s.split(', ');
  return `Dicetak ${fmtDate(date)} ${time || ''} WIB`.replace(/\s+/g, ' ');
};

const fmtTs = (iso) => {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return '-';
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [date, time] = s.split(', ');
  return `${fmtDate(date)} ${time || ''}`.trim();
};

// kolom tabel daftar: [x, lebar]
const COL = { apa: [M + 4, 246], siapa: [M + 258, 82], kapan: [M + 346, 104], prio: [M + 456, 59] };
const HEADS = { PLAN: ['PEKERJAAN', 'PIC', 'PLAN START - FINISH'], DOC: ['APA', 'SIAPA', 'KAPAN'] };
const TITLES = { PLAN: 'KANBAN PLAN TASK', DOC: 'KANBAN TRACKING DOKUMEN' };

function colHead(doc, jenis) {
  const [a, b, c] = HEADS[jenis];
  const y = doc.y - 9;
  doc.text(a, COL.apa[0], y, 7.5, { bold: true, color: MUTE });
  doc.text(b, COL.siapa[0], y, 7.5, { bold: true, color: MUTE });
  doc.text(c, COL.kapan[0], y, 7.5, { bold: true, color: MUTE });
  doc.text('PRIORITAS', COL.prio[0], y, 7.5, { bold: true, color: MUTE });
  doc.y -= 14;
  doc.rect(M, doc.y, W - 2 * M, 0.6, LINE);
}

/** PDF daftar task: per kanban (Plan Task, lalu Dokumen), dikelompokkan per status. Mengembalikan Uint8Array. */
export function buildListPdf(tasks, { today, subtitle = 'Semua task' } = {}) {
  const doc = new Doc();
  header(doc, `Laporan task - ${subtitle}`);

  const overdue = tasks.filter((t) => isOverdue(t, today)).length;
  const nPlan = tasks.filter((t) => jenisOf(t) === 'PLAN').length;
  doc.text(`Total ${tasks.length} task   |   Plan Task ${nPlan}   |   Dokumen ${tasks.length - nPlan}   |   Overdue ${overdue}`, M, doc.y, 9, { color: MUTE });
  doc.y -= 24;

  if (!tasks.length) doc.text('Tidak ada task.', M, doc.y, 11, { color: MUTE });

  for (const j of ['PLAN', 'DOC']) {
    const group = tasks.filter((t) => jenisOf(t) === j);
    if (!group.length) continue;
    doc.need(120);
    doc.text(TITLES[j], M, doc.y - 10, 11, { bold: true, color: BRAND });
    doc.y -= 15;
    doc.text(JENIS_META[j].statuses.map((s) => `${STATUS_META[s].label} ${group.filter((t) => t.status === s).length}`).join('   '), M, doc.y - 8, 8, { color: MUTE });
    doc.y -= 18;

    for (const s of JENIS_META[j].statuses) {
      const list = group.filter((t) => t.status === s).sort((a, b) => byPriority(a, b) || a.selesai.localeCompare(b.selesai));
      if (!list.length) continue;
      doc.need(70);
      const bar = () => {
        doc.rect(M, doc.y - 18, W - 2 * M, 18, STATUS_META[s].color);
        doc.text(`${STATUS_META[s].label}  (${list.length})`, M + 6, doc.y - 13, 10, { bold: true, color: '#ffffff' });
        doc.y -= 22;
        colHead(doc, j);
      };
      bar();
      for (const t of list) {
        const over = isOverdue(t, today);
        const apa = wrap(t.apa, 9.5, false, COL.apa[1], 5);
        const note = s === 'NOTE' && t.catatan ? wrap('Catatan: ' + t.catatan, 8, false, COL.apa[1], 4) : [];
        const siapa = wrap(t.siapa, 9, false, COL.siapa[1], 2);
        const h = Math.max(apa.length * 12 + note.length * 10, siapa.length * 12, over ? 24 : 12) + 8;
        if (doc.need(h)) bar();
        const top = doc.y - 13;
        apa.forEach((l, i) => doc.text(l, COL.apa[0], top - i * 12, 9.5, { raw: true }));
        note.forEach((l, i) => doc.text(l, COL.apa[0], top - apa.length * 12 - i * 10 + 1, 8, { raw: true, color: '#b45309' }));
        siapa.forEach((l, i) => doc.text(l, COL.siapa[0], top - i * 12, 9, { raw: true }));
        doc.text(fmtRange(t.mulai, t.selesai), COL.kapan[0], top, 8.5, { color: over ? RED : INK });
        if (over) doc.text('OVERDUE', COL.kapan[0], top - 11, 7.5, { bold: true, color: RED });
        const p = prioOf(t);
        doc.text(p === 'HIGH' ? 'High' : PRIORITY_META[p].label, COL.prio[0], top, 8.5, { bold: p !== 'NORMAL', color: PRIORITY_META[p].color });
        doc.y -= h;
        doc.rect(M, doc.y, W - 2 * M, 0.6, LINE);
      }
      doc.y -= 16;
    }
    doc.y -= 6;
  }
  return doc.build(stamp());
}

/** PDF satu kartu task. Mengembalikan Uint8Array. */
export function buildTaskPdf(t, { today } = {}) {
  const doc = new Doc();
  const plan = jenisOf(t) === 'PLAN';
  header(doc, plan ? 'Kartu plan task' : 'Kartu task dokumen');
  const over = isOverdue(t, today);
  const p = prioOf(t);

  wrap(t.apa, 16, true, W - 2 * M).forEach((l) => {
    doc.need(22);
    doc.text(l, M, doc.y - 14, 16, { bold: true, raw: true });
    doc.y -= 21;
  });
  doc.y -= 8;

  let x = M;
  x += doc.badge(STATUS_META[t.status]?.label || t.status, x, doc.y - 8, STATUS_META[t.status]?.color || MUTE) + 6;
  x += doc.badge(PRIORITY_META[p].label, x, doc.y - 8, PRIORITY_META[p].color) + 6;
  if (over) doc.badge('OVERDUE', x, doc.y - 8, RED);
  doc.y -= 34;

  const field = (label, value, color = INK) => {
    const lines = wrap(value || '-', 11, false, W - 2 * M - 110);
    lines.forEach((l, i) => {
      doc.need(16);
      if (i === 0) doc.text(label, M, doc.y - 11, 9, { bold: true, color: MUTE });
      doc.text(l, M + 110, doc.y - 11, 11, { raw: true, color });
      doc.y -= 16;
    });
    doc.y -= 4;
    doc.rect(M, doc.y, W - 2 * M, 0.6, LINE);
    doc.y -= 4;
  };
  field('KANBAN', plan ? 'Plan Task' : 'Tracking Dokumen');
  field('STATUS', STATUS_META[t.status]?.label || t.status);
  field('PRIORITAS', PRIORITY_META[p].label, PRIORITY_META[p].color);
  field(plan ? 'PIC' : 'SIAPA', t.siapa);
  field(plan ? 'PLAN START - FINISH' : 'KAPAN', fmtRange(t.mulai, t.selesai) + (over ? '  (OVERDUE)' : ''), over ? RED : INK);
  field('CATATAN', t.catatan);
  field('DIBUAT OLEH', t.created_by);
  field('DIBUAT', fmtTs(t.created_at));
  field('TERAKHIR DIUBAH', fmtTs(t.updated_at));
  field('ID', t.id, MUTE);
  return doc.build(stamp());
}

/** Simpan/unduh PDF. Di iPhone/iPad memakai lembar Share (unduhan blob tidak andal di PWA iOS). */
export async function savePdf(bytes, name) {
  const type = 'application/pdf';
  const blob = new Blob([bytes], { type });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && navigator.canShare) {
    const file = new File([blob], name, { type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
