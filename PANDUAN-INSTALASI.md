# Panduan Migrasi — KAGUMI Transport ke GitHub Pages + Apps Script API

Mulai versi 2.0, aplikasi dibagi dua:

| Bagian | Tempat | Isi |
|---|---|---|
| **Backend (API)** | Google Apps Script (proyek yang sudah ada) | `Kode.gs` saja |
| **Frontend (tampilan)** | GitHub Pages | `index.html`, `css/`, `js/` (folder ZIP ini) |

Data di spreadsheet, akun pengguna, dan kata sandi **tidak berubah**. Semuanya tetap di Google Drive Anda.

---

## Bagian A — Perbarui backend di Apps Script

Kerjakan di proyek Apps Script yang sudah ada (yang sudah pernah menjalankan `setupAppEnvironment`).

1. Buka berkas **Kode.gs** → Ctrl+A → Delete → tempel isi `Kode.gs` versi 2.0 (dikirim terpisah, bukan di dalam ZIP) → Ctrl+S.
2. Hapus tiga berkas HTML lama: **Index.html**, **Stylesheet.html**, **JavaScript.html** (klik ⋮ di samping nama berkas → Hapus). Versi API tidak memakainya lagi.
3. Pastikan **Setelan proyek (ikon roda gigi) → Zona waktu** = `(GMT+07:00) Jakarta`.
4. **Jangan** jalankan `setupAppEnvironment` lagi — data sudah ada.
5. Perbarui penerapan:
   - **Terapkan → Kelola penerapan → ✏️ Edit**
   - **Versi:** Versi baru
   - **Jalankan sebagai:** Saya
   - **Yang memiliki akses:** **Siapa saja** *(wajib — bukan "Siapa saja yang memiliki Akun Google")*
   - **Terapkan**, lalu salin **URL aplikasi web** yang berakhiran **`/exec`**.
6. **Uji:** tempel URL `/exec` itu di tab browser baru. Harus tampil teks seperti:
   ```
   {"success":true,"data":{"app":"KAGUMI Transport","versi":"2.0","siap":true,...},"message":"KAGUMI API aktif"}
   ```
   - Muncul halaman login Google → akses penerapan belum **Siapa saja**. Ulangi langkah 5.
   - Muncul halaman aplikasi lama → versi penerapan belum diperbarui. Ulangi langkah 5 dan pilih **Versi baru**.
7. (Opsional) Jalankan fungsi **`diagnosa`** dari editor, lalu cek Log eksekusi. Semua baris harus ✅.

> Fungsi berbahaya (setup, reset sandi, pemicu, diagnosa) **tidak bisa** dipanggil dari internet. API hanya menerima daftar aksi aplikasi, dan setiap aksi tetap memeriksa login serta peran.

---

## Bagian B — Isi alamat API di frontend

1. Ekstrak ZIP `kagumi-frontend.zip`. Hasilnya folder **`kagumi-frontend`** yang langsung berisi `index.html`, `css/`, dan `js/`.
2. Buka **`kagumi-frontend\js\config.js`** dengan Notepad.
3. Ganti `TEMPEL_URL_EXEC_DI_SINI` dengan URL `/exec` dari Bagian A, langkah 5:
   ```js
   window.KAGUMI_CONFIG = {
     GAS_URL: 'https://script.google.com/macros/s/AKfy..../exec'
   };
   ```
   Tanda kutip `'` di kedua ujung harus tetap ada. Simpan.

URL ini **bukan rahasia**. Keamanan dijaga oleh login email + kata sandi di dalam aplikasi.

---

## Bagian C — Unggah ke GitHub Pages

> Folder kerja untuk semua perintah di bawah adalah **`kagumi-frontend`**, yaitu folder yang langsung berisi `index.html`. Jangan menjalankan perintah dari folder induknya.

### C1. Pasang Git (sekali saja)
Unduh dari https://git-scm.com/download/win, pasang dengan pilihan bawaan, lalu buka **PowerShell**. Cek dengan:
```powershell
git --version
```

### C2. Atur identitas (sekali saja)
```powershell
git config --global user.name "Nama Anda"
git config --global user.email "email-akun-github@contoh.com"
```

### C3. Buat repository di GitHub
github.com → **+** → **New repository** → nama misalnya `kagumi` → **Public** → **jangan** centang README/.gitignore/license → **Create repository**.

### C4. Masuk ke folder & periksa isinya
Buka folder `kagumi-frontend` di File Explorer, klik address bar, ketik `powershell`, lalu tekan Enter. Kemudian jalankan:
```powershell
dir
```
Yang **harus** terlihat: `index.html`, folder `css`, folder `js`, dan dua berkas `.md`. Kalau yang terlihat justru folder `kagumi-frontend`, masuk dulu dengan `cd kagumi-frontend`.

### C5. Kirim ke GitHub (satu per satu)
```powershell
git init
git add .
git commit -m "Upload pertama KAGUMI"
git branch -M main
git remote add origin https://github.com/USERNAME/kagumi.git
git push -u origin main
```
Saat diminta **Password**, tempel **Personal Access Token**, bukan kata sandi akun. Buat token di https://github.com/settings/tokens → *Generate new token (classic)* → centang **repo**. Saat token ditempel, layar tetap kosong. Itu normal.

### C6. Aktifkan Pages
Di repository: **Settings → Pages** → Source **Deploy from a branch** → Branch **main** / **(root)** → **Save**. Centang **Enforce HTTPS** (wajib untuk kamera di form inspeksi). Tunggu 1–2 menit, lalu buka:
```
https://USERNAME.github.io/kagumi/
```

---

## Bagian D — Memperbarui di kemudian hari

**Tampilan (frontend)** — dari folder `kagumi-frontend`:
```powershell
git add .
git commit -m "Ringkas perubahan"
git push
```
Tunggu 1–2 menit, lalu tekan **Ctrl+Shift+R**.

**Backend** — tempel Kode.gs baru → Simpan → **Kelola penerapan → Edit → Versi baru → Terapkan**. URL `/exec` tetap sama, jadi `config.js` tidak perlu diubah.

---

## Masalah umum

| Gejala | Penyebab | Solusi |
|---|---|---|
| Layar "Alamat server belum diatur" | `GAS_URL` di `js/config.js` belum diisi atau tidak berakhiran `/exec` | Isi URL yang benar, lalu `git add .` → `commit` → `push` |
| "Tidak dapat terhubung ke server" saat masuk | Akses penerapan bukan **Siapa saja**, atau internet terputus | Bagian A langkah 5–6 |
| "Server tidak mengirim data yang benar" | URL `/dev` dipakai, atau penerapan versi lama | Pakai URL **/exec** dan buat **Versi baru** |
| Halaman tampil polos tanpa warna, atau muncul pesan "berkas tidak termuat" | Folder `css/` atau `js/` tidak ikut terunggah | Periksa repository di github.com: harus ada folder `css` dan `js` |
| GitHub Pages 404 | `index.html` tidak berada di root repository | Push ulang dari folder `kagumi-frontend` |
| Tampilan masih versi lama | Cache browser | Ctrl+Shift+R atau jendela Samaran |
| Tombol "Masuk dengan Google" hilang | Memang tidak tersedia di versi GitHub | Masuk dengan email + kata sandi. Pemilik bisa membuat ulang sandi lewat fungsi `resetSandiPemilik` |

## Catatan perubahan v2.0
- Login hanya dengan email + kata sandi. Login Google tidak tersedia, karena frontend berada di luar Google sehingga akun Google pengguna tidak bisa dibaca.
- Pengguna yang sudah masuk lewat versi lama perlu masuk ulang sekali, karena alamat situsnya berbeda.
- Semua fitur lain tetap sama: form, cetak, inspeksi + foto, invoice, finance, laporan, dan pengaturan.
