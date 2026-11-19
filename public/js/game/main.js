/**
 * main.js — Orkestrasi halaman pemain:
 * identitas -> sesi -> dunia 3D (atau fallback 2D) -> jawab soal -> rekap nilai.
 */
import { api, simpanSesi, ambilSesi, hapusSesi, simpanIdentitas, ambilIdentitas, fmtDurasi, hashString } from '../api.js';
import { buatQuiz } from './quiz.js';

window.__GP_BOOT = true;

const $ = (id) => document.getElementById(id);
const el = {
  screenIdentitas: $('screen-identitas'), form: $('form-identitas'),
  nama: $('in-nama'), kelas: $('in-kelas'), nis: $('in-nis'), grup: $('in-grup'),
  errIdentitas: $('identitas-error'),
  kartuSesi: $('kartu-sesi'), sesiInfo: $('sesi-info'), btnLanjut: $('btn-lanjut'), btnSesiBaru: $('btn-sesi-baru'),
  screenLoading: $('screen-loading'), loadingTeks: $('loading-teks'),
  game: $('game-container'), canvas: $('canvas3d'), hud: $('hud'),
  hudNama: $('hud-nama'), hudSkor: $('hud-skor'), hudBenar: $('hud-benar'), hudWaktu: $('hud-waktu'),
  hudProgress: $('hud-progress'), hudProgressTeks: $('hud-progress-teks'),
  minimap: $('minimap'), minimapJarak: $('minimap-jarak'),
  btnBantuan: $('btn-bantuan'), btnSelesai: $('btn-selesai'),
  interact: $('interact-prompt'), interactTeks: $('interact-teks'),
  infoTerakhir: $('info-soal-terakhir'), touchControls: $('touch-controls'),
  modalHasil: $('modal-hasil'), hasilJudul: $('hasil-judul'), hasilIdentitas: $('hasil-identitas'),
  hasilSkor: $('hasil-skor'), hasilBenar: $('hasil-benar'), hasilSalah: $('hasil-salah'),
  hasilPersen: $('hasil-persen'), hasilWaktu: $('hasil-waktu'), hasilTotal: $('hasil-total'),
  hasilStatus: $('hasil-status'), btnMainLagi: $('btn-main-lagi'), btnGantiPemain: $('btn-ganti-pemain'),
  modalBantuan: $('modal-bantuan'), btnTutupBantuan: $('btn-tutup-bantuan'),
  modalKonfirmasi: $('modal-konfirmasi'), konfJudul: $('konfirmasi-judul'), konfTeks: $('konfirmasi-teks'),
  konfYa: $('btn-konfirmasi-ya'), konfTidak: $('btn-konfirmasi-tidak'),
  toast: $('toast'),
  screenFallback: $('screen-fallback'), fallbackAlasan: $('fallback-alasan'), fallbackKonten: $('fallback-konten'),
};

const sentuhMode = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/* ================= state global ================= */
const state = {
  pemain: null,
  config: null,
  mode3D: false,          // '3d' | '2d'
  dunia: null,            // instance world
  pemain3D: null,         // instance Pemain
  renderer: null, scene: null, camera: null,
  minimap: null, quiz: null,
  targetSoal: null,
  selesai: false,
};
window.__GP_STATE = state; // untuk debugging di konsol & pengujian otomatis

/* ================= util tampilan ================= */
let _toastTimer = null;
function toast(pesan, tipe = 'ok', durasi = 2600) {
  el.toast.textContent = pesan;
  el.toast.className = 'toast ' + tipe;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.toast.classList.add('hidden'), durasi);
}

function konfirmasi(judul, teks) {
  return new Promise((resolve) => {
    el.konfJudul.textContent = judul;
    el.konfTeks.textContent = teks;
    el.modalKonfirmasi.classList.remove('hidden');
    const selesaiBersih = (hasil) => {
      el.modalKonfirmasi.classList.add('hidden');
      el.konfYa.onclick = null;
      el.konfTidak.onclick = null;
      resolve(hasil);
    };
    el.konfYa.onclick = () => selesaiBersih(true);
    el.konfTidak.onclick = () => selesaiBersih(false);
  });
}

function tampilkanLoading(teks) {
  el.loadingTeks.textContent = teks || 'Menyiapkan...';
  el.screenLoading.classList.remove('hidden');
  el.screenIdentitas.classList.add('hidden');
  el.game.classList.add('hidden');
  el.screenFallback.classList.add('hidden');
}
const berikutnyaFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/* ================= cek WebGL ================= */
function cekWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

/* ================= identitas & sesi ================= */
function isiFormDariIdentitas() {
  const idn = ambilIdentitas();
  if (!idn) return;
  el.nama.value = idn.nama || '';
  el.kelas.value = idn.kelas || '';
  el.nis.value = idn.nis || '';
  el.grup.value = idn.kode_grup || '';
}

function bacaForm() {
  return {
    nama: el.nama.value.trim(),
    kelas: el.kelas.value.trim(),
    nis: el.nis.value.trim(),
    kode_grup: el.grup.value.trim(),
  };
}

function tampilkanErrorIdentitas(pesan) {
  if (!pesan) { el.errIdentitas.classList.add('hidden'); return; }
  el.errIdentitas.textContent = pesan;
  el.errIdentitas.classList.remove('hidden');
}

async function cekSesiTersimpan() {
  const sesi = ambilSesi();
  if (!sesi) return;
  try {
    const r = await api('/api/players/' + encodeURIComponent(sesi));
    const p = r.pemain;
    if (p.status !== 'playing') { hapusSesi(); return; }
    simpanIdentitas({ nama: p.nama, kelas: p.kelas, nis: p.nis, kode_grup: p.kode_grup });
    const terjawab = Object.keys(p.jawaban || {}).length;
    el.sesiInfo.textContent = `Lanjutkan sesi "${p.nama}" — skor ${p.skor}, ${terjawab} soal terjawab, waktu berjalan ${fmtDurasi(p.detik)}.`;
    el.kartuSesi.classList.remove('hidden');
    el.btnLanjut.dataset.sesi = sesi;
  } catch (e) {
    hapusSesi();
  }
}

async function mulaiDariForm() {
  const data = bacaForm();
  tampilkanErrorIdentitas('');
  if (data.nama.length < 2) { tampilkanErrorIdentitas('Nama lengkap wajib diisi (min. 2 karakter).'); el.nama.focus(); return; }
  el.form.querySelector('button[type=submit]').disabled = true;
  try {
    const r = await api('/api/players', { method: 'POST', body: data });
    simpanSesi(r.pemain.id);
    simpanIdentitas(data);
    await mulaiPermainan(r.pemain);
  } catch (e) {
    tampilkanErrorIdentitas(e.message);
  } finally {
    el.form.querySelector('button[type=submit]').disabled = false;
  }
}

async function lanjutkanSesi() {
  const sesi = el.btnLanjut.dataset.sesi;
  if (!sesi) return;
  el.btnLanjut.disabled = true; el.btnSesiBaru.disabled = true;
  try {
    const r = await api('/api/players/' + encodeURIComponent(sesi));
    if (r.pemain.status !== 'playing') { hapusSesi(); location.reload(); return; }
    await mulaiPermainan(r.pemain);
  } catch (e) {
    toast(e.message, 'err', 3500);
    hapusSesi();
    el.kartuSesi.classList.add('hidden');
  } finally {
    el.btnLanjut.disabled = false; el.btnSesiBaru.disabled = false;
  }
}

/* ================= pemilihan jalur (3D / 2D) ================= */
async function mulaiPermainan(pemain) {
  tampilkanLoading('Mengambil paket soal...');
  let config;
  try {
    config = await api('/api/game/config');
  } catch (e) {
    el.screenLoading.classList.add('hidden');
    el.screenIdentitas.classList.remove('hidden');
    tampilkanErrorIdentitas(e.message);
    return;
  }
  if (!config.total) {
    el.screenLoading.classList.add('hidden');
    el.screenIdentitas.classList.remove('hidden');
    tampilkanErrorIdentitas('Paket soal sedang kosong / dinonaktifkan admin. Hubungi pengelola.');
    return;
  }
  state.pemain = pemain;
  state.config = config;
  state.selesai = false;

  if (!cekWebGL()) { jalankanFallback('Perangkat/browser ini tidak mendukung WebGL.'); return; }
  try {
    await jalankan3D();
    state.mode3D = '3d';
  } catch (err) {
    console.warn('Gagal memuat 3D:', err);
    jalankanFallback('Modul 3D gagal dimuat: ' + (err && err.message ? err.message : err));
  }
}

async function jalankanFallback(alasan) {
  state.mode3D = '2d';
  el.screenLoading.classList.add('hidden');
  el.screenIdentitas.classList.add('hidden');
  el.game.classList.add('hidden');
  el.screenFallback.classList.remove('hidden');
  el.fallbackAlasan.textContent = alasan + ' Bermain dalam mode 2D — semua soal, skor, dan daftar nilai tetap berfungsi.';
  try {
    const mod = await import('../fallback2d.js');
    mod.jalankanFallback({
      pemain: state.pemain,
      config: state.config,
      el: { konten: el.fallbackKonten },
      tampilkanHasil,
      toast,
    });
  } catch (e) {
    el.fallbackKonten.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = 'Gagal memuat modul cadangan: ' + e.message;
    el.fallbackKonten.appendChild(p);
  }
}

/* ================= JALUR 3D ================= */
async function jalankan3D() {
  tampilkanLoading('Memuat mesin 3D...');
  await berikutnyaFrame();

  const [THREE, wMod, pMod, mMod] = await Promise.all([
    import('three'),
    import('./world.js'),
    import('./player.js'),
    import('./minimap.js'),
  ]);

  tampilkanLoading('Membangun pulau & labirin...');
  await berikutnyaFrame();

  const canvas = el.canvas;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 420);

  const dunia = wMod.buatDunia(scene);
  const pemain3D = new pMod.Pemain({
    scene, world: dunia, camera, canvas, sentuh: sentuhMode,
  });

  state.renderer = renderer; state.scene = scene; state.camera = camera;
  state.dunia = dunia; state.pemain3D = pemain3D;
  state.minimap = new mMod.Minimap(el.minimap, dunia);

  state.quiz = buatQuiz({
    els: {
      modal: $('modal-soal'),
      kategori: $('soal-kategori'), poin: $('soal-poin'), tipe: $('soal-tipe'),
      pertanyaan: $('soal-pertanyaan'), opsi: $('soal-opsi'),
      isianWrap: $('soal-isian'), inputIsian: $('input-isian'), btnKirim: $('btn-kirim-isian'),
      feedback: $('soal-feedback'), btnTutup: $('btn-tutup-soal'),
    },
    onJawab: tanganiJawaban,
    onTutup: () => {
      if (state.selesai) return;
      pemain3D.setAktif(true);
      if (!sentuhMode) pemain3D.mintaKunci();
      if (semuaTerjawab()) selesaikanPetualangan(true);
    },
  });

  pemain3D.onInteract = () => {
    if (!state.targetSoal) {
      toast('Tidak ada soal di dekatmu. Ikuti tanda kuning di minimap.', 'ok', 2200);
      return;
    }
    bukaSoalTarget();
  };

  window.addEventListener('resize', ukurUlang);
  ukurUlang();

  resetKeAwal(state.pemain, state.config);

  el.screenLoading.classList.add('hidden');
  el.game.classList.remove('hidden');
  el.hud.classList.remove('hidden');
  el.touchControls.classList.toggle('hidden', !sentuhMode);
  if (!sentuhMode) toast('Klik layar untuk mengunci kursor · Esc melepas · E membuka soal', 'ok', 5000);

  mulaiLoop();
}

function ukurUlang() {
  if (!state.renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  state.renderer.setSize(w, h, false);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
}

function resetKeAwal(pemain, config) {
  state.pemain = pemain;
  state.config = config;
  state.selesai = false;
  const seed = hashString(pemain.id);
  state.dunia.spawnSoal(config.soal, seed);
  Object.keys(pemain.jawaban || {}).forEach((qid) => state.dunia.tandaiDijawab(qid));
  state.pemain3D.teleport(state.dunia.titikSpawnPemain.x, state.dunia.titikSpawnPemain.z);
  state.pemain3D.kamYaw = 0;
  state.pemain3D.kamPitch = 0.34;
  state.pemain3D.setAktif(true);
  perbaruiHUD();
  el.interact.classList.add('hidden');
}

function semuaTerjawab() {
  const total = state.config ? state.config.total : 0;
  const dijawab = state.pemain ? Object.keys(state.pemain.jawaban || {}).length : 0;
  return total > 0 && dijawab >= total;
}

function bukaSoalTarget() {
  if (!state.targetSoal || state.selesai) return;
  const soal = state.config.soal.find((s) => s.id === state.targetSoal.id);
  if (!soal) return;
  state.pemain3D.setAktif(false);
  state.pemain3D.lepasKunci();
  el.interact.classList.add('hidden');
  state.quiz.buka({ soal, pemainId: state.pemain.id });
}

function tanganiJawaban(soal, hasil) {
  if (!soal || !hasil || hasil.gagal) {
    if (hasil && hasil.pesan) toast(hasil.pesan, 'err', 3500);
    return;
  }
  state.pemain.jawaban[soal.id] = { benar: hasil.benar };
  state.pemain.skor = hasil.skor;
  state.pemain.benar = hasil.benarTotal;
  state.pemain.salah = hasil.salahTotal;
  state.pemain.total = hasil.total;
  state.dunia.tandaiDijawab(soal.id);
  perbaruiHUD();

  el.infoTerakhir.textContent = hasil.benar
    ? `Benar! +${hasil.poin} poin`
    : `Belum tepat · kunci: ${hasil.kunciTeks}`;
  el.infoTerakhir.className = 'info-terakhir ' + (hasil.benar ? 'benar' : 'salah');
  clearTimeout(el.infoTerakhir._t);
  el.infoTerakhir._t = setTimeout(() => el.infoTerakhir.classList.add('hidden'), 3500);
}

/* ---------- HUD ---------- */
function perbaruiHUD() {
  const p = state.pemain;
  if (!p) return;
  const total = state.config ? state.config.total : 0;
  const dijawab = Object.keys(p.jawaban || {}).length;
  el.hudNama.textContent = p.nama + (p.kelas ? ' · ' + p.kelas : '');
  el.hudSkor.textContent = p.skor || 0;
  el.hudBenar.textContent = `${p.benar || 0}/${total}`;
  const pct = total ? Math.round((dijawab / total) * 100) : 0;
  el.hudProgress.style.width = pct + '%';
  el.hudProgressTeks.textContent = `${dijawab} dari ${total} soal`;
}

function perbaruiWaktu() {
  const p = state.pemain;
  if (!p) return;
  const lewat = (Date.now() - new Date(p.mulai).getTime()) / 1000;
  el.hudWaktu.textContent = fmtDurasi(lewat);
}

/* ---------- loop utama ---------- */
let _loopPernah = false;
let _jamTerakhir = 0;
function mulaiLoop() {
  if (_loopPernah) return;
  _loopPernah = true;
  _jamTerakhir = performance.now();
  let akumHud = 0;

  function loop(now) {
    const dt = Math.min(0.05, (now - _jamTerakhir) / 1000);
    _jamTerakhir = now;
    const waktu = now / 1000;

    state.dunia.update(waktu, dt);
    state.pemain3D.update(dt);
    state.renderer.render(state.scene, state.camera);

    // soal terdekat yang belum terjawab
    let target = null;
    if (!state.selesai && !state.quiz.aktif()) {
      state.dunia.posisiSoal.forEach((pos, id) => {
        if (state.pemain.jawaban && state.pemain.jawaban[id]) return;
        const d = state.pemain3D.jarakKe(pos.x, pos.z);
        if (d <= 3.6 && (!target || d < target.jarak)) target = { id, jarak: d };
      });
    }
    state.targetSoal = target;
    if (target && !state.quiz.aktif() && el.modalHasil.classList.contains('hidden')) {
      el.interact.classList.remove('hidden');
      el.interactTeks.textContent = sentuhMode ? 'BUKA — Soal terdekat' : 'Buka Soal terdekat';
    } else {
      el.interact.classList.add('hidden');
    }

    // minimap + jarak
    const info = state.minimap.draw(
      state.pemain3D.pos, state.pemain3D.kamYaw,
      state.dunia.posisiSoal, state.pemain.jawaban, waktu, state.config.total
    );
    if (info.belum === 0) el.minimapJarak.textContent = 'Semua soal terjawab!';
    else if (info.terdekat) el.minimapJarak.textContent = `Terdekat ${Math.round(info.terdekat.jarak)} m · sisa ${info.belum}`;

    akumHud += dt;
    if (akumHud > 0.5) { akumHud = 0; perbaruiWaktu(); }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/* ================= penyelesaian ================= */
async function selesaikanPetualangan(otomatis) {
  if (state.selesai) return;
  if (!otomatis) {
    const ya = await konfirmasi('Akhiri petualangan?', `Kamu telah menjawab ${Object.keys(state.pemain.jawaban || {}).length} dari ${state.config.total} soal. Nilai akan disimpan ke daftar nilai.`);
    if (!ya) return;
  }
  state.selesai = true;
  state.pemain3D.setAktif(false);
  state.pemain3D.lepasKunci();
  el.interact.classList.add('hidden');

  try {
    const r = await api(`/api/players/${state.pemain.id}/finish`, { method: 'POST' });
    hapusSesi();
    tampilkanHasil(r.pemain, true);
  } catch (e) {
    state.selesai = false;
    state.pemain3D.setAktif(true);
    toast('Gagal menyimpan hasil: ' + e.message, 'err', 4000);
  }
}

function tampilkanHasil(p, tersimpan) {
  el.hasilJudul.textContent = 'Ringkasan Petualangan';
  el.hasilIdentitas.textContent = [p.nama, p.kelas && 'Kelas ' + p.kelas, p.nis && 'NIS ' + p.nis, p.kode_grup && 'Grup ' + p.kode_grup]
    .filter(Boolean).join(' · ');
  el.hasilSkor.textContent = p.skor;
  el.hasilBenar.textContent = p.benar;
  el.hasilSalah.textContent = p.salah;
  el.hasilPersen.textContent = p.persen + '%';
  el.hasilWaktu.textContent = fmtDurasi(p.detik);
  el.hasilTotal.textContent = p.total;
  el.hasilStatus.textContent = tersimpan
    ? 'Tersimpan ke daftar nilai'
    : 'Nilai tersimpan';
  el.hasilStatus.className = 'status-simpan' + (tersimpan ? '' : ' gagal');
  el.modalHasil.classList.remove('hidden');
}

/* ================= tombol-tombol ================= */
el.form.addEventListener('submit', (e) => { e.preventDefault(); mulaiDariForm(); });
el.btnLanjut.addEventListener('click', lanjutkanSesi);
el.btnSesiBaru.addEventListener('click', () => {
  hapusSesi();
  el.kartuSesi.classList.add('hidden');
  el.nama.focus();
});

el.btnSelesai.addEventListener('click', () => selesaikanPetualangan(false));
el.btnBantuan.addEventListener('click', () => {
  el.modalBantuan.classList.remove('hidden');
  if (state.pemain3D) { state.pemain3D.setAktif(false); state.pemain3D.lepasKunci(); }
});
el.btnTutupBantuan.addEventListener('click', () => {
  el.modalBantuan.classList.add('hidden');
  if (state.pemain3D && !state.quiz.aktif() && el.modalHasil.classList.contains('hidden')) state.pemain3D.setAktif(true);
});

el.btnMainLagi.addEventListener('click', async () => {
  el.modalHasil.classList.add('hidden');
  const data = ambilIdentitas() || { nama: state.pemain.nama, kelas: state.pemain.kelas, nis: state.pemain.nis, kode_grup: state.pemain.kode_grup };
  try {
    const r = await api('/api/players', { method: 'POST', body: data });
    simpanSesi(r.pemain.id);
    const config = await api('/api/game/config');
    state.pemain = r.pemain;
    state.config = config;
    if (state.mode3D === '3d') {
      resetKeAwal(r.pemain, config);
      el.game.classList.remove('hidden');
      el.hud.classList.remove('hidden');
      toast('Sesi baru dimulai. Selamat berpetualang!', 'ok');
    } else {
      await jalankanFallback('Mode 2D aktif.');
    }
  } catch (e) {
    console.warn('Main lagi gagal:', e);
    toast('Gagal memulai sesi baru: ' + e.message, 'err', 4000);
  }
});

el.btnGantiPemain.addEventListener('click', () => {
  hapusSesi();
  location.reload();
});

/* ================= boot ================= */
(async function boot() {
  isiFormDariIdentitas();
  await cekSesiTersimpan();
  el.nama.focus();
})();
