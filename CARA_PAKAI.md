# Task MonitorinG — Cara Pasang & Pakai

Biaya: **Rp 0**. Database memakai Google Sheets, API memakai Google Apps Script, hosting memakai GitHub Pages.
Waktu pasang ± 20 menit.

---

## A. Siapkan Database (Google Sheets)

1. Buka https://sheets.new, lalu beri nama **Task MonitorinG DB**.
2. Pilih menu **Extensions → Apps Script**.
3. Hapus isi `Code.gs`, tempel seluruh isi file **`apps-script/Code.gs`**, lalu klik 💾 Save.
4. Di dropdown fungsi (sebelah tombol Run), pilih **`setup`**, lalu klik **Run**.
   - Google akan meminta izin. Klik **Review permissions**, pilih akun Anda, lalu **Advanced → Go to … (unsafe)** dan **Allow**.
     Peringatan ini muncul karena script ini buatan Anda sendiri, belum diverifikasi Google, dan memang normal.
5. Kembali ke spreadsheet dan refresh. Menu baru **Task MonitorinG** akan muncul.
6. Pilih **Task MonitorinG → 2. Tambah user / reset PIN** untuk setiap anggota tim.
   Jalankan dari **menu di tab spreadsheet**, bukan dari tombol Run di editor: kotak isiannya muncul di tab spreadsheet,
   dan kalau tidak diisi, script berhenti setelah 6 menit dengan pesan "Melebihi jumlah eksekusi maksimum".
   PIN berupa 4–8 digit angka. PIN disimpan dalam bentuk hash, bukan teks asli.

> Jangan share spreadsheet ini ke publik. Aplikasi mengakses data lewat script, bukan lewat link sheet.

## B. Publikasikan API (Apps Script Web App)

1. Di editor Apps Script, pilih **Deploy → New deployment**.
2. Klik ⚙️ lalu pilih **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Klik **Deploy**, lalu salin **Web app URL** (berakhiran `/exec`).
4. Buka `js/config.js` dan ganti `PASTE_URL_APPS_SCRIPT_DI_SINI` dengan URL tersebut.

## C. Online-kan via GitHub Pages

1. Buat repo baru di GitHub, misalnya `task-monitoring`. Repo boleh **Public**, karena data tidak ikut tersimpan di repo.
2. Upload seluruh isi folder ini, **kecuali folder `apps-script/` dan `tests/`** (keduanya opsional dan tidak berbahaya kalau ikut).
3. Buka **Settings → Pages**. Pada Source pilih **Deploy from a branch**, Branch **main**, folder **/ (root)**, lalu **Save**.
4. Tunggu 1–2 menit. Aplikasi akan aktif di `https://<username>.github.io/task-monitoring/`.

## D. Pasang di HP (PWA)

- **Android (Chrome):** buka URL-nya, lalu ketuk ⋮ → **Add to Home screen / Install app**.
- **iPhone (Safari):** buka URL-nya, lalu ketuk Share → **Add to Home Screen**.

---

## Cara Pakai

| Fitur | Cara |
|---|---|
| Task baru | Ketuk tombol **+**. Tanggal mulai & selesai otomatis terisi hari ini |
| Mode Tim / Pribadi | Tombol **👥 Tim / 🔒 Pribadi** di kiri atas. **Tim** = task bersama, PIC dipilih dari daftar user. **Pribadi** = catatan sendiri: hanya Anda yang melihat dan mengubah, PIC diketik bebas (mandor, vendor, dll.). Kedua kanban, Kalender, Who-What, dan PDF tersedia di kedua mode |
| PDF per PIC | Di tab **Who-What**, tekan **PDF** di samping nama untuk mengekspor task orang/PIC itu saja (mengikuti filter; centang *Tampilkan semua* untuk menyertakan yang sudah closed) |
| Arsip | Supaya task selesai tidak menumpuk: buka kartu yang sudah **Closed / Reject / Plan Task Closed** lalu tekan **📦 Arsipkan**, atau tekan **📦 Arsipkan** di judul kolom untuk mengarsipkan semua task Anda di kolom itu sekaligus. Task arsip tidak dihapus: tekan tombol **📦 Arsip (n)** untuk melihatnya, lalu **↩ Keluarkan dari arsip** atau **Reopen** jika perlu dibuka lagi. PDF juga bisa dibuat dari tampilan Arsip |
| Kanban Plan Task | Tab **Plan Task**: monitoring pekerjaan dengan kolom **Plan Task → Plan Task Ready → Plan Task With Note → Plan Task Closed**. Isi: Pekerjaan, PIC, Plan Start – Plan Finish. Pindah ke *With Note* wajib mengisi catatan, dan catatannya tampil di kartu |
| Kanban Dokumen | Tab **Dokumen**: tracking dokumen (Open → Progress → Submit → Revisi/Closed/Reject). Centang **Tampilkan Plan Task With Note** untuk melihat plan task ber-catatan sebagai kolom tambahan di sini |
| Filter kanban | Di **Kalender** dan **Who-What** ada dropdown *Semua kanban / Kanban Plan Task / Kanban Dokumen*, plus filter status, orang, dan prioritas |
| Prioritas | Pilih **Urgent**, **High Priority**, atau **Normal** di form task. Urgent/High diberi flag ⚑ dan naik ke atas kolom Kanban. Bisa difilter lewat dropdown prioritas |
| Export PDF | Tombol **PDF** di kanan atas: pilih *Semua task* atau *Sesuai filter*. Untuk satu kartu: buka kartunya lalu tekan **PDF** |
| Ubah status | Ketuk kartu, lalu pilih tombol status. Di laptop, kartu bisa di-drag antar kolom |
| Kalender | Tab **Kalender**. Warna menunjukkan status; ketuk tanggal untuk melihat daftar task hari itu |
| Who-What | Tab **Who-What** menampilkan task aktif per orang, diurutkan dari yang paling banyak overdue |
| Filter | Dropdown nama di atas berlaku untuk semua tab. Filter status hanya ada di Kalender |

**Alur status yang diizinkan:**

```
OPEN → PROGRESS → SUBMIT → CLOSED
  ↓                 ↓  ↘
REJECT            REVISI → PROGRESS
CLOSED / REJECT → OPEN (reopen)
```

**Hak ubah:** semua orang bisa *melihat* semua task. Yang bisa *mengubah* hanya **pelaksana** (kolom Siapa) atau **pembuat** task.
Kartu milik orang lain ditandai 🔒.

**Overdue:** task yang lewat tanggal selesai dan belum CLOSED/REJECT ditandai merah.

**Offline:** aplikasi tetap bisa dibuka dan menampilkan data terakhir, tetapi tidak bisa mengubah data sampai sinyal kembali.

---

## Admin

| Kebutuhan | Cara |
|---|---|
| Tambah user / lupa PIN | Menu spreadsheet **Task MonitorinG → 2** (ketik nama yang sama untuk mereset) |
| User keluar | Menu **Task MonitorinG → 3. Nonaktifkan user**. Sesi login-nya langsung tidak berlaku |
| Lihat riwayat status | Sheet **Log** (siapa, dari status apa, ke status apa, kapan, catatan) |
| Lihat error server | Sheet **ErrorLog** |
| Backup | File → Version history, atau File → Download → CSV (disarankan mingguan) |

## Update Aplikasi (PENTING)

- **Update `Code.gs`:** pilih **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
  Jangan pakai "New deployment", karena itu membuat URL baru dan aplikasi akan putus.
- **Dari versi lama (tanpa prioritas / Kanban Plan Task / mode pribadi):** setelah mengganti `Code.gs`, jalankan fungsi **`setup`** sekali lagi (menambah kolom `prioritas`, `jenis`, `pemilik`, dan `arsip` di sheet Tasks; data lama aman, dianggap Normal dan masuk Kanban Dokumen), lalu deploy *New version*.
- **Update file web:** naikkan versi `CACHE` di `sw.js` (misalnya `tm-v1` menjadi `tm-v2`) agar HP user mengambil versi baru.

## Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| "API_URL belum diisi" | `js/config.js` belum diisi URL `/exec` |
| "Respons server tidak valid" | Deployment bukan *Anyone*, atau URL salah (harus `/exec`, bukan `/dev`) |
| "Sheet … belum ada" | Fungsi `setup` belum dijalankan |
| "Task sudah diubah orang lain" | Ada orang lain yang mengubah task lebih dulu. Data dimuat ulang otomatis, lalu ulangi |
| "Terlalu banyak percobaan" | PIN salah 5x. Tunggu 15 menit atau minta admin reset PIN |
| Tampilan tidak berubah setelah update | Versi `CACHE` di `sw.js` belum dinaikkan. Tutup lalu buka ulang aplikasi |
