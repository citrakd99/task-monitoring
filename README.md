# Task MonitorinG

PWA monitoring task tim: **Kanban** (Open, Progress, Submit, Revisi, Closed, Reject), **Kalender**, dan **Who-What**.
Database memakai Google Sheets, API memakai Google Apps Script, hosting memakai GitHub Pages. Semuanya gratis.

Panduan pasang & pakai: **[CARA_PAKAI.md](CARA_PAKAI.md)**

## Struktur

| File ID | Path | Isi |
|---|---|---|
| F01 | `index.html` | Shell aplikasi + CSP |
| F02 | `js/app.js` | Controller: login, render, dialog, offline |
| F03 | `js/api.js` | Klien API (POST text/plain, cache lokal) |
| F04 | `js/kanban.js` | Board Kanban + drag (desktop) |
| F05 | `js/calendar.js` | Kalender bulanan |
| F06 | `js/whowhat.js` | Daftar per orang |
| F07 | `sw.js` | Service worker (offline shell) |
| F08 | `manifest.json` | Manifest PWA |
| F09 | `css/style.css` | Gaya mobile-first |
| F10 | `apps-script/Code.gs` | Backend: auth, state machine, lock, log |
| F11 | `CARA_PAKAI.md` | Panduan |
| F12 | `js/util.js` | Logika murni + helper DOM aman |
| F13 | `js/config.js` | URL API |
| F14 | `js/pdf.js` | Export PDF (semua / sesuai filter / per kartu), tanpa library |
| — | `tools/dev-server.js` | Server preview lokal dengan data demo |

Fitur: flag prioritas (Urgent / High Priority / Normal), export PDF, layout HP + tablet + laptop, bisa dipasang sebagai PWA.

## Test & preview

```bash
npm test          # Node 18+: 27 test (backend via simulator Apps Script + logika frontend + PDF)
npm run preview   # http://localhost:4173 dengan data demo di memori
```
