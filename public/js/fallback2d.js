/**
 * fallback2d.js — Mode cadangan 2D bila WebGL / mesin 3D tidak tersedia.
 * Alur, penilaian, dan penyimpanan nilai sama persis dengan mode 3D.
 */
import { api } from './api.js';

const HURUF = ['A', 'B', 'C', 'D', 'E', 'F'];

export function jalankanFallback({ pemain, config, el, tampilkanHasil, toast }) {
  const root = el.konten;
  root.innerHTML = '';
  const st = { pemain, config, selesai: false, menunggu: false };

  /* ---- bar progres ---- */
  const bar = document.createElement('div');
  bar.className = 'fb-progress';
  root.appendChild(bar);

  const btnSelesai = document.createElement('button');
  btnSelesai.type = 'button';
  btnSelesai.className = 'btn btn-waspada';
  btnSelesai.textContent = 'Selesai & Simpan Nilai';
  btnSelesai.style.marginBottom = '16px';
  btnSelesai.addEventListener('click', () => akhiri(false));
  root.appendChild(btnSelesai);

  const daftar = document.createElement('div');
  root.appendChild(daftar);

  function terjawabCount() { return Object.keys(st.pemain.jawaban || {}).length; }

  function perbaruiBar() {
    const d = terjawabCount(), t = config.total;
    bar.textContent = `${st.pemain.nama} — skor ${st.pemain.skor} · benar ${st.pemain.benar}/${t} · ${d}/${t} soal terjawab`;
    btnSelesai.disabled = st.selesai || st.menunggu;
    btnSelesai.textContent = st.selesai ? 'Sudah Disimpan' : 'Selesai & Simpan Nilai';
  }

  function buatKartu(soal, sudahDijawab, rec) {
    const kartu = document.createElement('div');
    kartu.className = 'fb-soal';
    const kepala = document.createElement('div');
    kepala.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap';
    [soal.kategori || 'Umum', soal.poin + ' poin', soal.tipe === 'pg' ? 'Pilihan Ganda' : 'Isian']
      .forEach((t) => {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = t;
        kepala.appendChild(b);
      });
    kartu.appendChild(kepala);

    const h = document.createElement('h4');
    h.textContent = soal.pertanyaan;
    kartu.appendChild(h);

    const umpan = document.createElement('div');
    kartu.appendChild(umpan);

    function tampilkanFeedback(benar, poin, kunciTeks, skor) {
      umpan.innerHTML = '';
      const f = document.createElement('div');
      f.className = 'feedback ' + (benar ? 'f-benar' : 'f-salah');
      const j = document.createElement('div');
      j.className = 'f-judul';
      j.textContent = benar ? `Benar! +${poin} poin` : 'Belum tepat';
      const k = document.createElement('div');
      k.className = 'f-kunci';
      k.innerHTML = (benar ? '' : `Jawaban benar: <b></b> · `) + `Skor: <b>${skor}</b>`;
      const bEl = k.querySelector('b');
      if (bEl) bEl.textContent = kunciTeks || '-';
      f.append(j, k);
      umpan.appendChild(f);
      kartu.style.borderColor = benar ? 'var(--aksen-2)' : 'var(--bahaya)';
      perbaruiBar();
    }

    if (sudahDijawab) {
      kartu.style.borderColor = rec.benar ? 'var(--aksen-2)' : 'var(--bahaya)';
      const f = document.createElement('div');
      f.className = 'feedback ' + (rec.benar ? 'f-benar' : 'f-salah');
      f.innerHTML = `<div class="f-judul">${rec.benar ? 'Sudah dijawab — benar' : 'Sudah dijawab — belum tepat'}</div>`;
      umpan.appendChild(f);
      return kartu;
    }

    async function kirim(jawaban, tombol) {
      if (st.selesai || st.menunggu) return;
      st.menunggu = true;
      if (tombol) tombol.disabled = true;
      kartu.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
      try {
        const r = await api(`/api/players/${st.pemain.id}/answer`, {
          method: 'POST', body: { questionId: soal.id, jawaban },
        });
        const h2 = r.hasil;
        st.pemain.jawaban[soal.id] = { benar: h2.benar };
        st.pemain.skor = h2.skor;
        st.pemain.benar = h2.benarTotal;
        st.pemain.salah = h2.salahTotal;
        st.pemain.total = h2.total;
        if (soal.tipe === 'pg') {
          kartu.querySelectorAll('.opsi').forEach((b) => {
            if (Number(b.dataset.asli) === h2.kunci) b.classList.add('benar');
            if (!h2.benar && b === tombol) b.classList.add('salah');
          });
        }
        tampilkanFeedback(h2.benar, h2.poin, h2.kunciTeks, h2.skor);
        if (terjawabCount() >= config.total) akhiri(true);
      } catch (err) {
        kartu.querySelectorAll('button, input').forEach((b) => { b.disabled = false; });
        toast(err.message, 'err', 3500);
      } finally {
        st.menunggu = false;
        perbaruiBar();
      }
    }

    if (soal.tipe === 'pg') {
      const opsi = document.createElement('div');
      opsi.className = 'fb-opsi';
      soal.opsi.forEach((teks, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opsi';
        b.dataset.asli = String(i);
        b.innerHTML = `<span class="opsi-huruf">${HURUF[i]}</span><span></span>`;
        b.lastElementChild.textContent = teks;
        b.addEventListener('click', () => kirim(i, b));
        opsi.appendChild(b);
      });
      kartu.appendChild(opsi);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'isian-wrap';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 160;
      input.placeholder = 'Ketik jawaban...';
      const kirimBtn = document.createElement('button');
      kirimBtn.type = 'button';
      kirimBtn.className = 'btn btn-utama';
      kirimBtn.textContent = 'Kirim';
      const kirimDariInput = () => {
        const v = input.value.trim();
        if (v) kirim(v, null);
        else input.focus();
      };
      kirimBtn.addEventListener('click', kirimDariInput);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); kirimDariInput(); } });
      wrap.append(input, kirimBtn);
      kartu.appendChild(wrap);
    }
    return kartu;
  }

  async function akhiri(otomatis) {
    if (st.selesai) return;
    if (!otomatis) {
      const sisa = config.total - terjawabCount();
      if (sisa > 0 && !window.confirm(`Masih ada ${sisa} soal belum terjawab. Tetap akhiri dan simpan nilai?`)) return;
    }
    st.selesai = true;
    perbaruiBar();
    try {
      const r = await api(`/api/players/${st.pemain.id}/finish`, { method: 'POST' });
      st.pemain = r.pemain;
      tampilkanHasil(r.pemain, true);
    } catch (err) {
      st.selesai = false;
      toast('Gagal menyimpan: ' + err.message, 'err', 4000);
      perbaruiBar();
    }
  }

  config.soal.forEach((soal) => {
    const rec = st.pemain.jawaban && st.pemain.jawaban[soal.id];
    daftar.appendChild(buatKartu(soal, !!rec, rec));
  });

  perbaruiBar();
}
