# Game 3D Petualangan Edukasi — Mencari Soal

Game web 3D berbasis Three.js: pemain menjelajahi labirin, menemukan kristal berisi soal
(pilihan ganda / isian), menjawab sambil bergerak (WASD + mouse, atau sentuh di HP),
sampai semua soal selesai — lengkap dengan Panel Admin untuk mengelola soal dan daftar nilai.

## Persyaratan

- Node.js 18+ (tanpa dependensi eksternal — murni Node bawaan)
- Browser modern (Chrome/Edge/Firefox). WebGL diperlukan untuk mode 3D;
  tanpa WebGL game otomatis memakai mode 2D (canvas) sehingga tetap bisa dimainkan.

## Menjalankan

```powershell
node server/server.js
```

Lalu buka:

| URL | Fungsi |
|---|---|
| http://localhost:3000/ | Game (pemain) |
| http://localhost:3000/admin | Panel admin |

Port bisa diubah: `$env:PORT=8080; node server/server.js`

### Panel admin

- Password default: `admin123` (ubah di menu **Pengaturan**, disimpan di `server/config.json`).
- Tab **Soal**: tambah/edit/nonaktifkan/hapus soal, import CSV/JSON, export CSV/JSON.
- Tab **Nilai**: daftar skor pemain (cari, filter, urutkan, hapus, reset semua, export CSV).
- Tab **Pengaturan**: acak posisi soal, pack soal aktif/nonaktif, ganti password.

Format import CSV (baris pertama = header):

```csv
pertanyaan,tipe,opsiA,opsiB,opsiC,opsiD,kunci,poin,kategori
"Berapa 2+2?",pg,3,4,5,6,B,10,Matematika
"Satuan SI gaya?",isian,,,,,,,,newton,10,Fisika
```

## Struktur proyek

```
server/
  server.js        # REST API + penyajian file statis (port 3000)
  store.js         # lapisan simpan JSON atomik
  config.json      # password admin (dibuat otomatis)
  data/            # questions.json, players.json, settings.json
public/
  index.html       # halaman pemain
  admin.html       # panel admin
  vendor/          # three.module.min.js (Three.js r160, offline)
  js/game/         # main, world, player, minimap, quiz
  js/              # api, admin, fallback2d
```

## Pengujian

Semua uji dijalankan dari folder proyek dengan Chrome headless:

```powershell
# 1) Test API (31 pemeriksaan, tanpa browser)
powershell -ExecutionPolicy Bypass -File "$env:TEMP\opencode\test-api.ps1"

# 2) E2E pemain: mulai → jawab → refresh/resume → selesai → main lagi
node "$env:TEMP\opencode\e2e-game.mjs"

# 3) E2E admin: login → CRUD → import → nilai → pengaturan → logout
node "$env:TEMP\opencode\e2e-admin.mjs"
```

Semua uji harus exit code `0` dan menampilkan `ERRORS/WARNINGS (0)`.
Uji E2E membutuhkan Chrome terpasang (otomatis mencari di `C:\Program Files\Google\Chrome\Application\chrome.exe`).

> Sebelum mengulang uji, kembalikan data agar bersih bila diperlukan:
> salin ulang data dummy ke `server/data/questions.json`, kosongkan
> `players.json` menjadi `[]`, dan `config.json` ke `{"adminPassword":"admin123"}`.

## Data & backup

Semua data persisten berupa file JSON di `server/data/` plus `server/config.json`.
Untuk backup, salin seluruh isi folder tersebut. Penulisan dilakukan atomik
(file sementera lalu rename) sehingga aman dari data setengah tulis.
