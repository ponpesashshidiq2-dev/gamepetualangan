# Game 3D Petualangan Edukasi — Mencari Soal (PHP, tanpa Node.js)

Game web 3D berbasis Three.js: pemain menjelajahi labirin, menemukan kristal berisi soal
(pilihan ganda / isian), menjawab sambil bergerak (WASD + mouse, atau sentuh di HP),
sampai semua soal selesai — lengkap dengan Panel Admin untuk mengelola soal dan daftar nilai.

Backend memakai **satu file `api.php`** (PHP murni, tanpa dependensi) sehingga bisa
langsung dijalankan di **hosting shared (cPanel dll)** — tidak perlu Node.js.

## Persyaratan hosting

- PHP 7.4+ (cPanel/shared hosting pada umumnya sudah punya)
- Browser modern (Chrome/Edge/Firefox). WebGL diperlukan untuk mode 3D;
  tanpa WebGL game otomatis memakai mode 2D (canvas) sehingga tetap bisa dimainkan.

## Cara upload ke hosting

1. Buka folder `public/` (atau `public\` di Windows).
2. Upload **seluruh isi folder `public/`** ke `public_html/` (File Manager cPanel / FTP),
   termasuk file `api.php` dan folder `data/`.
3. Buka:

   | URL | Fungsi |
   |---|---|
   | `https://domainanda.com/` | Game (pemain) |
   | `https://domainanda.com/admin.html` | Panel admin |

4. Password admin default: **`admin123`** (ubah di menu **Pengaturan**).

> Folder `data/` otomatis dibuat di **luar** root web (`~/gp_data`) bila hosting
> mengizinkan — sehingga file soal/nilai tidak bisa diunduh publik. Bila tidak
> memungkinkan, data jatuh ke `public/data/` yang dilindungi `.htaccess`.

### Menjalankan lokal (opsional)

```powershell
php -S localhost:8000 -t public
```

Lalu buka `http://localhost:8000/` dan `http://localhost:8000/admin.html`.

## Panel admin

- Tab **Soal**: tambah/edit/nonaktifkan/hapus soal, **import Word/JSON/CSV**, export JSON/CSV.
- Tab **Nilai**: daftar skor pemain (cari, filter, urutkan, hapus, reset semua, export CSV).
- Tab **Pengaturan**: acak posisi soal, pack soal aktif/nonaktif, ganti password.

### Import soal dari Microsoft Word (tempel)

1. Buka docx → blok teks soal → **Ctrl+C**.
2. Di admin: **Import Soal (Word/JSON/CSV)** → tempel (Ctrl+V) ke kotak teks.
3. Pratinjau menampilkan jumlah soal terdeteksi → **Import Sekarang**.

Format yang dikenali:

```text
1. Berapa hasil dari 2 + 2?
A. 3
B. 4
C. 5
D. 6
Kunci: B
Poin: 10
Kategori: Matematika

2. Ibu kota negara Jepang adalah...
A. Seoul
B. Tokyo
Kunci: B

3. Satuan SI untuk gaya adalah...
Kunci: newton
```

Aturan:

- Soal dipisah **baris kosong**, diawali nomor (`1.` / `1)`), atau label `Soal 3.`
- Opsi memakai huruf `A.`–`F.` (disarankan) atau daftar bernomor `1)` `2)` …
- Baris kunci: `Kunci: B`, `Jawaban: newton`, atau **teks opsi yang ditebal/garisbawahi**
  di Word (otomatis terdeteksi saat tempel).
- Tanpa baris opsi → soal **isian singkat**; kunci berupa teks jawaban.
- Kunci juga boleh berupa teks jawaban (`Kunci: Tokyo`) atau angka urut opsi.
- Beberapa jawaban benar untuk isian dipisah `|`, contoh: `Tokyo|Tokio`.

### Import CSV / JSON

Format CSV (baris pertama = header):

```csv
pertanyaan,tipe,opsiA,opsiB,opsiC,opsiD,kunci,poin,kategori
"Berapa 2+2?",pg,3,4,5,6,B,10,Matematika
"Satuan SI gaya?",isian,,,,,,,,newton,10,Fisika
```

(Kolom `id` di depan juga diterima bila hasil export dari panel admin.)

## Struktur proyek

```
public/                 ← isi folder ini yang di-upload ke hosting
  index.html            # halaman pemain
  admin.html            # panel admin
  api.php               # REST API PHP (pengganti server Node.js)
  data/.htaccess        # penjaga folder data (fallback)
  vendor/               # three.module.min.js (Three.js r160, offline)
  js/game/              # main, world, player, minimap, quiz
  js/                   # api, admin, word-import, fallback2d
  css/
```

## Data & backup

Semua data persisten berupa file JSON:

| File | Isi |
|---|---|
| `data/questions.json` | daftar soal |
| `data/players.json` | sesi & nilai pemain |
| `data/settings.json` | pengaturan game |
| `data/config.json` | password admin |

Untuk backup, salin seluruh isi folder `data/` (di panel admin: **Informasi Sistem**
menunjukkan lokasi pastinya). Penulisan dilakukan atomik (file sementera lalu rename)
sehingga aman dari data setengah tulis.

## Pengujian manual

```powershell
php -S localhost:8000 -t public
```

1. Buka `http://localhost:8000/` → layar identitas muncul, isi nama → **Mulai Petualangan**
   → dunia 3D termuat (atau mode 2D), soal tampil di minimap.
2. Buka `http://localhost:8000/admin.html` → login `admin123` → daftar soal bawaan tampil.
3. **Import Soal (Word/JSON/CSV)** → tempel contoh format di atas → pratinjau
   "Terdeteksi N soal" → **Import Sekarang** → tabel bertambah.
4. Tab **Nilai** → skor dari langkah 1 muncul setelah menekan **Selesai** di game.
