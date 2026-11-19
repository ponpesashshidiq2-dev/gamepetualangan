/* ============================================================
   admin.js — Panel Admin: login, CRUD soal, import/export,
   daftar nilai (cari/filter/sort/reset/export), pengaturan.
   (skrip klasik — tanpa dependensi eksternal)
   ============================================================ */
(function () {
  'use strict';

  const TOKEN_KEY = 'gp_admin_token';
  const $ = (id) => document.getElementById(id);
  const el = {
    login: $('screen-login'), formLogin: $('form-login'), pass: $('in-password'), loginErr: $('login-error'),
    app: $('app'), nav: $('tab-nav'), btnLogout: $('btn-logout'),
    tbodySoal: $('tbody-soal'), kosongSoal: $('tabel-soal-kosong'),
    ringkasTotal: $('ringkas-total-soal'), ringkasAktif: $('ringkas-soal-aktif'), ringkasPoin: $('ringkas-total-poin'),
    tbodyNilai: $('tbody-nilai'), kosongNilai: $('tabel-nilai-kosong'), catatanNilai: $('nilai-catatan'),
    rkPemain: $('rk-pemain'), rkMain: $('rk-main'), rkSelesai: $('rk-selesai'), rkTinggi: $('rk-tertinggi'), rkRata: $('rk-rata'),
    cari: $('cari-nilai'), fStatus: $('filter-status'), fKelas: $('filter-kelas'), sort: $('sort-nilai'),
    modalSoal: $('modal-soal'), formSoal: $('form-soal'), soalJudul: $('soal-modal-judul'),
    inPertanyaan: $('soal-pertanyaan'), inTipe: $('soal-tipe'), inPoin: $('soal-poin'), inKategori: $('soal-kategori'),
    daftarOpsi: $('daftar-opsi'), blokOpsi: $('blok-opsi'), blokKunci: $('blok-kunci'), selKunci: $('soal-kunci'),
    blokKunciIsian: $('blok-kunci-isian'), inKunciTeks: $('soal-kunci-teks'),
    inAktif: $('soal-aktif'), soalError: $('soal-error'), btnTambahOpsi: $('btn-tambah-opsi'),
    modalImport: $('modal-import'), impMode: $('import-mode'), impFile: $('import-file'), impTeks: $('import-teks'), impHasil: $('import-hasil'),
    swPack: $('sw-pack'), swAcak: $('sw-acak'), setPesan: $('settings-pesan'),
    passBaru: $('in-pass-baru'), passUlang: $('in-pass-ulang'), passPesan: $('pass-pesan'),
    toast: $('toast-admin'),
  };

  let soalList = [];
  let nilaiList = [];
  let idEdit = null;

  /* ================= util ================= */
  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

  let _tt = null;
  function toast(pesan, tipe) {
    el.toast.textContent = pesan;
    el.toast.className = 'toast-admin ' + (tipe || '');
    clearTimeout(_tt);
    _tt = setTimeout(() => el.toast.classList.add('hidden'), 3000);
  }

  function pesan(node, teks, jenis) {
    if (!teks) { node.classList.add('hidden'); node.textContent = ''; return; }
    node.textContent = teks;
    node.className = 'f-error' + (jenis ? ' ' + jenis : '');
    node.classList.remove('hidden');
  }

  async function req(url, opt) {
    opt = opt || {};
    const headers = { Authorization: 'Bearer ' + token() };
    if (opt.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
      method: opt.method || 'GET', headers, body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-json */ }
    if (res.status === 401) { paksaKeluar(); throw new Error('Sesi admin berakhir. Silakan login ulang.'); }
    if (!res.ok) throw new Error((data && data.error) || 'Gagal (' + res.status + ')');
    return data;
  }

  function fmtDurasi(d) {
    d = Math.max(0, Math.floor(d || 0));
    const j = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = d % 60;
    const p = (n) => String(n).padStart(2, '0');
    return j ? `${j}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }
  function fmtWaktu(iso) {
    if (!iso) return '—';
    const t = new Date(iso);
    return isNaN(t) ? '—' : t.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function unduhBlob(blob, nama) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nama;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function stamp() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  /* ================= AUTENTIKASI ================= */
  function tampilkanAplikasi() {
    el.login.classList.add('hidden');
    el.app.classList.remove('hidden');
    muatSemua();
  }
  function paksaKeluar() {
    localStorage.removeItem(TOKEN_KEY);
    el.app.classList.add('hidden');
    el.login.classList.remove('hidden');
    el.pass.value = '';
    el.pass.focus();
  }
  async function verifikasiToken() {
    if (!token()) return false;
    try { await req('/api/admin/settings'); return true; }
    catch (e) { return false; }
  }

  el.formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    pesan(el.loginErr, '');
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: el.pass.value }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { pesan(el.loginErr, d.error || 'Login gagal.'); return; }
      localStorage.setItem(TOKEN_KEY, d.token);
      el.pass.value = '';
      tampilkanAplikasi();
    } catch (err) { pesan(el.loginErr, err.message); }
  });
  el.btnLogout.addEventListener('click', () => { paksaKeluar(); toast('Berhasil keluar.'); });

  /* ================= TAB ================= */
  el.nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    el.nav.querySelectorAll('button').forEach((x) => x.classList.toggle('aktif', x === b));
    ['soal', 'nilai', 'pengaturan'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
    if (b.dataset.tab === 'pengaturan') muatSettings();
    if (b.dataset.tab === 'nilai') muatNilai();
  });

  async function muatSemua() {
    try {
      await Promise.all([muatSoal(), muatNilai(), muatSettings()]);
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ============================================================
     SOAL
     ============================================================ */
  async function muatSoal() {
    const r = await req('/api/admin/questions');
    soalList = r.soal || [];
    renderSoal();
  }

  function renderSoal() {
    const tb = el.tbodySoal;
    tb.innerHTML = '';
    el.kosongSoal.classList.toggle('hidden', soalList.length > 0);
    el.ringkasTotal.textContent = soalList.length;
    el.ringkasAktif.textContent = soalList.filter((q) => q.aktif !== false).length;
    el.ringkasPoin.textContent = soalList.reduce((a, q) => a + (q.poin || 0), 0);

    soalList.forEach((q, i) => {
      const tr = document.createElement('tr');
      const kunciTeks = q.tipe === 'pg' ? (q.opsi[q.kunci] != null ? q.opsi[q.kunci] : '-') : q.kunci;
      const opsiHtml = q.tipe === 'pg'
        ? q.opsi.map((o, oi) => `<span class="${oi === q.kunci ? 'badge-kunci' : ''}">${['A', 'B', 'C', 'D', 'E', 'F'][oi]}. ${esc(o)}</span>`).join(' ')
        : `<span class="badge-kunci">Jawaban: ${esc(kunciTeks)}</span>`;
      tr.innerHTML = `
        <td class="kol-no">${i + 1}</td>
        <td><span class="teks-potong" title="${esc(q.pertanyaan)}">${esc(q.pertanyaan)}</span></td>
        <td><span class="chip ${q.tipe === 'pg' ? 'chip-pg' : 'chip-isian'}">${q.tipe === 'pg' ? 'Pilihan Ganda' : 'Isian'}</span></td>
        <td>${opsiHtml}</td>
        <td class="kol-angka">${q.poin}</td>
        <td>${esc(q.kategori || '—')}</td>
        <td><button type="button" class="chip ${q.aktif !== false ? 'chip-aktif' : 'chip-nonaktif'}" data-toggle="${q.id}" title="Klik untuk mengaktifkan/menonaktifkan">${q.aktif !== false ? 'Aktif' : 'Nonaktif'}</button></td>
        <td class="kol-aksi">
          <button type="button" class="btn-mini-aksi edit" data-edit="${q.id}">Edit</button>
          <button type="button" class="btn-mini-aksi hapus" data-hapus="${q.id}">Hapus</button>
        </td>`;
      tb.appendChild(tr);
    });
  }

  el.tbodySoal.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-edit]');
    const h = e.target.closest('[data-hapus]');
    const g = e.target.closest('[data-toggle]');
    try {
      if (t) bukaFormSoal(soalList.find((q) => q.id === t.dataset.edit));
      else if (h) {
        const q = soalList.find((x) => x.id === h.dataset.hapus);
        if (!q) return;
        if (!confirm('Hapus soal:\n"' + q.pertanyaan + '" ?')) return;
        await req('/api/admin/questions/' + q.id, { method: 'DELETE' });
        toast('Soal dihapus.');
        await muatSoal();
      } else if (g) {
        const q = soalList.find((x) => x.id === g.dataset.toggle);
        if (!q) return;
        await req('/api/admin/questions/' + q.id, { method: 'PUT', body: { aktif: !(q.aktif !== false) } });
        await muatSoal();
        toast(q.aktif !== false ? 'Soal dinonaktifkan.' : 'Soal diaktifkan.');
      }
    } catch (err) { toast(err.message, 'err'); }
  });

  /* ---------- form soal ---------- */
  function barisOpsi(nilai) {
    const div = document.createElement('div');
    div.className = 'opsi-baris';
    div.innerHTML = `<span class="huruf"></span><input type="text" maxlength="140" placeholder="Teks opsi"><button type="button" class="hapus-opsi" title="Hapus opsi">&times;</button>`;
    div.querySelector('input').value = nilai || '';
    div.querySelector('.hapus-opsi').addEventListener('click', () => {
      if (el.daftarOpsi.children.length <= 2) { toast('Minimal 2 opsi.', 'err'); return; }
      div.remove();
      nomoriOpsi(); bangunKunci();
    });
    div.querySelector('input').addEventListener('input', bangunKunci);
    el.daftarOpsi.appendChild(div);
    nomoriOpsi();
  }
  function nomoriOpsi() {
    Array.from(el.daftarOpsi.children).forEach((r, i) => { r.querySelector('.huruf').textContent = 'ABCDEF'[i] || String(i + 1); });
  }
  function daftarTeksOpsi() {
    return Array.from(el.daftarOpsi.querySelectorAll('input')).map((i) => i.value.trim()).filter(Boolean);
  }
  function bangunKunci() {
    const opsi = daftarTeksOpsi();
    const sebelum = el.selKunci.value;
    el.selKunci.innerHTML = '';
    opsi.forEach((o, i) => {
      const op = document.createElement('option');
      op.value = String(i);
      op.textContent = 'ABCDEF'[i] + '. ' + o;
      el.selKunci.appendChild(op);
    });
    if (sebelum && Number(sebelum) < opsi.length) el.selKunci.value = sebelum;
  }
  function gantiTipe() {
    const pg = el.inTipe.value === 'pg';
    el.blokOpsi.classList.toggle('hidden', !pg);
    el.blokKunci.classList.toggle('hidden', !pg);
    el.blokKunciIsian.classList.toggle('hidden', pg);
  }

  function bukaFormSoal(q) {
    idEdit = q ? q.id : null;
    el.soalJudul.textContent = q ? 'Edit Soal' : 'Tambah Soal';
    pesan(el.soalError, '');
    el.inPertanyaan.value = q ? q.pertanyaan : '';
    el.inTipe.value = q ? (q.tipe || 'pg') : 'pg';
    el.inPoin.value = q ? q.poin : 10;
    el.inKategori.value = q ? (q.kategori || '') : '';
    el.inAktif.checked = q ? q.aktif !== false : true;
    el.inKunciTeks.value = q && q.tipe === 'isian' ? (Array.isArray(q.kunci) ? q.kunci.join('|') : q.kunci || '') : '';
    el.daftarOpsi.innerHTML = '';
    const opsi = q && q.tipe === 'pg' ? q.opsi : [];
    (opsi.length ? opsi : ['', '']).forEach((o) => barisOpsi(o));
    bangunKunci();
    if (q && q.tipe === 'pg') el.selKunci.value = String(q.kunci != null ? q.kunci : 0);
    gantiTipe();
    el.modalSoal.classList.remove('hidden');
    setTimeout(() => el.inPertanyaan.focus(), 50);
  }

  el.inTipe.addEventListener('change', gantiTipe);
  el.btnTambahOpsi.addEventListener('click', () => {
    if (el.daftarOpsi.children.length >= 6) { toast('Maksimal 6 opsi.', 'err'); return; }
    barisOpsi('');
  });
  $('btn-tambah-soal').addEventListener('click', () => bukaFormSoal(null));
  $('btn-batal-soal').addEventListener('click', () => el.modalSoal.classList.add('hidden'));

  el.formSoal.addEventListener('submit', async (e) => {
    e.preventDefault();
    pesan(el.soalError, '');
    const tipe = el.inTipe.value;
    const body = {
      pertanyaan: el.inPertanyaan.value.trim(),
      tipe,
      poin: Number(el.inPoin.value) || 0,
      kategori: el.inKategori.value.trim(),
      aktif: el.inAktif.checked,
    };
    if (tipe === 'pg') {
      const opsi = daftarTeksOpsi();
      if (opsi.length < 2) { pesan(el.soalError, 'Minimal 2 opsi jawaban (opsi kosong diabaikan).'); return; }
      const pilih = Number(el.selKunci.value) || 0;
      if (pilih >= opsi.length) { pesan(el.soalError, 'Pilih kunci jawaban yang valid.'); return; }
      body.opsi = opsi;
      body.kunci = pilih;
    } else {
      const k = el.inKunciTeks.value.trim();
      if (!k) { pesan(el.soalError, 'Kunci jawaban wajib diisi.'); return; }
      body.kunci = k;
      body.opsi = [];
    }
    try {
      if (idEdit) await req('/api/admin/questions/' + idEdit, { method: 'PUT', body });
      else await req('/api/admin/questions', { method: 'POST', body });
      el.modalSoal.classList.add('hidden');
      toast(idEdit ? 'Soal diperbarui.' : 'Soal ditambahkan.');
      idEdit = null;
      await muatSoal();
    } catch (err) { pesan(el.soalError, err.message); }
  });

  /* ---------- export soal ---------- */
  async function unduhSoal(format) {
    try {
      const res = await fetch('/api/admin/questions/export?format=' + format, {
        headers: { Authorization: 'Bearer ' + token() },
      });
      if (!res.ok) throw new Error('Export gagal (' + res.status + ')');
      const blob = await res.blob();
      unduhBlob(blob, 'soal-' + stamp() + (format === 'csv' ? '.csv' : '.json'));
      toast('File soal (' + format.toUpperCase() + ') diunduh.');
    } catch (e) { toast(e.message, 'err'); }
  }
  $('btn-export-json').addEventListener('click', () => unduhSoal('json'));
  $('btn-export-csv').addEventListener('click', () => unduhSoal('csv'));
  $('btn-refresh-soal').addEventListener('click', () => muatSoal().then(() => toast('Daftar soal dimuat ulang.')).catch((e) => toast(e.message, 'err')));

  /* ---------- import ---------- */
  $('btn-import').addEventListener('click', () => {
    pesan(el.impHasil, '');
    el.impTeks.value = '';
    el.impFile.value = '';
    el.modalImport.classList.remove('hidden');
  });
  $('btn-batal-import').addEventListener('click', () => el.modalImport.classList.add('hidden'));
  el.impFile.addEventListener('change', () => {
    const f = el.impFile.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { el.impTeks.value = r.result; pesan(el.impHasil, 'File "' + f.name + '" dimuat. Klik Import Sekarang.', 'ok'); };
    r.readAsText(f);
  });
  $('btn-jalan-import').addEventListener('click', async () => {
    const teks = el.impTeks.value.trim();
    if (!teks) { pesan(el.impHasil, 'Pilih file atau tempel data terlebih dahulu.'); return; }
    const format = (teks[0] === '[' || teks[0] === '{') ? 'json' : 'csv';
    try {
      const r = await req('/api/admin/questions/import', {
        method: 'POST', body: { mode: el.impMode.value, format, data: teks },
      });
      let msg = `Import ${format.toUpperCase()} selesai — ditambah ${r.ditambah}, diperbarui ${r.diperbarui}.`;
      if (r.errors && r.errors.length) msg += ' Catatan: ' + r.errors.slice(0, 5).join(' | ') + (r.errors.length > 5 ? ` (+${r.errors.length - 5} lain)` : '');
      pesan(el.impHasil, msg, (r.errors && r.errors.length) ? '' : 'ok');
      await muatSoal();
      if (!r.errors || !r.errors.length) setTimeout(() => el.modalImport.classList.add('hidden'), 1200);
    } catch (e) { pesan(el.impHasil, e.message); }
  });

  /* ============================================================
     DAFTAR NILAI
     ============================================================ */
  async function muatNilai() {
    const r = await req('/api/admin/scores');
    nilaiList = r.nilai || [];
    isiFilterKelas();
    renderNilai();
  }

  function isiFilterKelas() {
    const kini = el.fKelas.value;
    const kelas = Array.from(new Set(nilaiList.map((p) => (p.kelas || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'id'));
    el.fKelas.innerHTML = '<option value="">Semua</option>' + kelas.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
    if (kelas.includes(kini)) el.fKelas.value = kini;
  }

  function nilaiTerfilter() {
    const q = el.cari.value.trim().toLowerCase();
    const st = el.fStatus.value;
    const kls = el.fKelas.value;
    let list = nilaiList.filter((p) => {
      if (st && p.status !== st) return false;
      if (kls && (p.kelas || '') !== kls) return false;
      if (q) {
        const gabung = [p.nama, p.kelas, p.nis, p.kode_grup].join(' ').toLowerCase();
        if (!gabung.includes(q)) return false;
      }
      return true;
    });
    const sort = el.sort.value;
    const byTime = (a, b) => new Date(b.mulai) - new Date(a.mulai);
    if (sort === 'skor_desc') list.sort((a, b) => (b.skor - a.skor) || byTime(a, b));
    else if (sort === 'skor_asc') list.sort((a, b) => (a.skor - b.skor) || byTime(a, b));
    else if (sort === 'persen_desc') list.sort((a, b) => (b.persen - a.persen) || (b.skor - a.skor));
    else if (sort === 'baru_desc') list.sort(byTime);
    else if (sort === 'lama_asc') list.sort((a, b) => new Date(a.mulai) - new Date(b.mulai));
    else if (sort === 'nama_asc') list.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
    return list;
  }

  function renderNilai() {
    const semua = nilaiList;
    const selesai = semua.filter((p) => p.status === 'done');
    const main = semua.filter((p) => p.status === 'playing');
    const tertinggi = semua.reduce((m, p) => Math.max(m, p.skor || 0), 0);
    const rata = semua.length ? Math.round(semua.reduce((a, p) => a + (p.skor || 0), 0) / semua.length) : 0;
    el.rkPemain.textContent = semua.length;
    el.rkMain.textContent = main.length;
    el.rkSelesai.textContent = selesai.length;
    el.rkTinggi.textContent = tertinggi;
    el.rkRata.textContent = rata;

    const list = nilaiTerfilter();
    const tb = el.tbodyNilai;
    tb.innerHTML = '';
    el.kosongNilai.classList.toggle('hidden', list.length > 0);

    list.forEach((p, i) => {
      const tr = document.createElement('tr');
      const identitas = [p.nis && 'NIS ' + p.nis, p.kode_grup && 'Grup ' + p.kode_grup].filter(Boolean).join(' · ') || '—';
      tr.innerHTML = `
        <td class="kol-no">${i + 1}</td>
        <td><b>${esc(p.nama)}</b><span class="sub-teks">${esc(p.id)}</span></td>
        <td>${esc(p.kelas || '—')}</td>
        <td>${esc(identitas)}</td>
        <td class="kol-angka ${p.skor >= tertinggi && tertinggi > 0 ? 'skor-tinggi' : ''}">${p.skor}</td>
        <td>${p.benar}/${p.total}${p.salah ? ` <span class="sub-teks" style="display:inline">${p.salah} salah</span>` : ''}</td>
        <td class="kol-angka">${p.persen}%</td>
        <td>${fmtDurasi(p.detik)}</td>
        <td><span class="chip ${p.status === 'done' ? 'chip-selesai' : 'chip-main'}">${p.status === 'done' ? 'Selesai' : 'Sedang Main'}</span></td>
        <td>${fmtWaktu(p.status === 'done' ? p.selesai : p.mulai)}</td>
        <td class="kol-aksi"><button type="button" class="btn-mini-aksi hapus" data-hapus="${p.id}">Hapus</button></td>`;
      tb.appendChild(tr);
    });

    el.catatanNilai.textContent = list.length === semua.length
      ? `Menampilkan ${list.length} data`
      : `Menampilkan ${list.length} dari ${semua.length} data (terfilter)`;
  }

  [el.cari, el.fStatus, el.fKelas, el.sort].forEach((x) => x.addEventListener('input', () => { try { renderNilai(); } catch (e) {} }));
  $('btn-refresh-nilai').addEventListener('click', () => muatNilai().then(() => toast('Daftar nilai dimuat ulang.')).catch((e) => toast(e.message, 'err')));

  el.tbodyNilai.addEventListener('click', async (e) => {
    const h = e.target.closest('[data-hapus]');
    if (!h) return;
    const p = nilaiList.find((x) => x.id === h.dataset.hapus);
    if (!p) return;
    if (!confirm('Hapus nilai "' + p.nama + '" ?')) return;
    try {
      await req('/api/admin/scores/' + p.id, { method: 'DELETE' });
      toast('Data nilai dihapus.');
      await muatNilai();
    } catch (err) { toast(err.message, 'err'); }
  });

  $('btn-reset-nilai').addEventListener('click', async () => {
    if (!nilaiList.length) { toast('Belum ada data untuk direset.'); return; }
    if (!confirm('RESET semua daftar nilai (' + nilaiList.length + ' data)?\nTindakan ini tidak bisa dibatalkan.')) return;
    try {
      const r = await req('/api/admin/scores', { method: 'DELETE' });
      toast(r.message || 'Semua nilai direset.');
      await muatNilai();
    } catch (err) { toast(err.message, 'err'); }
  });

  $('btn-export-nilai').addEventListener('click', () => {
    const list = nilaiTerfilter();
    if (!list.length) { toast('Tidak ada data untuk diexport.', 'err'); return; }
    const header = ['No', 'Nama', 'Kelas', 'NIS', 'Kode Grup', 'Skor', 'Benar', 'Salah', 'Total', 'Persen', 'Waktu (detik)', 'Status', 'Mulai', 'Selesai', 'ID Sesi'];
    const baris = list.map((p, i) => [
      i + 1, p.nama, p.kelas || '', p.nis || '', p.kode_grup || '', p.skor, p.benar, p.salah, p.total,
      p.persen + '%', p.detik, p.status === 'done' ? 'Selesai' : 'Sedang Main',
      p.mulai, p.selesai || '', p.id,
    ]);
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '\uFEFF' + [header, ...baris].map((r) => r.map(cell).join(',')).join('\r\n');
    unduhBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'daftar-nilai-' + stamp() + '.csv');
    toast(`${list.length} data nilai diexport ke CSV (dapat dibuka di Excel).`);
  });

  /* ============================================================
     PENGATURAN
     ============================================================ */
  async function muatSettings() {
    try {
      const r = await req('/api/admin/settings');
      el.swPack.checked = r.settings.packAktif !== false;
      el.swAcak.checked = r.settings.acakPosisi !== false;
    } catch (e) { toast(e.message, 'err'); }
  }

  $('btn-simpan-settings').addEventListener('click', async () => {
    try {
      await req('/api/admin/settings', {
        method: 'PUT',
        body: { packAktif: el.swPack.checked, acakPosisi: el.swAcak.checked },
      });
      pesan(el.setPesan, 'Pengaturan disimpan.', 'ok');
      toast('Pengaturan disimpan.');
      setTimeout(() => pesan(el.setPesan, ''), 2500);
    } catch (e) { pesan(el.setPesan, e.message); }
  });

  $('btn-ganti-pass').addEventListener('click', async () => {
    const a = el.passBaru.value, b = el.passUlang.value;
    if (a.length < 6) { pesan(el.passPesan, 'Password minimal 6 karakter.'); return; }
    if (a !== b) { pesan(el.passPesan, 'Password baru dan ulangan tidak sama.'); return; }
    try {
      const r = await req('/api/admin/settings', { method: 'PUT', body: { password: a } });
      if (r.token) localStorage.setItem(TOKEN_KEY, r.token);
      el.passBaru.value = ''; el.passUlang.value = '';
      pesan(el.passPesan, 'Password berhasil diperbarui.', 'ok');
      toast('Password admin diperbarui.');
      setTimeout(() => pesan(el.passPesan, ''), 3000);
    } catch (e) { pesan(el.passPesan, e.message); }
  });

  /* ================= penutup modal ================= */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.modalSoal.classList.add('hidden');
      el.modalImport.classList.add('hidden');
    }
  });
  [el.modalSoal, el.modalImport].forEach((m) => m.addEventListener('mousedown', (e) => {
    if (e.target === m) m.classList.add('hidden');
  }));

  /* ================= boot ================= */
  (async function boot() {
    if (await verifikasiToken()) tampilkanAplikasi();
    else { el.login.classList.remove('hidden'); el.app.classList.add('hidden'); }
  })();
})();
