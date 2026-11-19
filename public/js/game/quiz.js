/**
 * quiz.js — Modal soal: menampilkan pertanyaan, mengirim jawaban ke server,
 * lalu menampilkan feedback benar/salah beserta kunci jawaban.
 */
import { api, acakSeeded, hashString, acakArray } from '../api.js';

const HURUF = ['A', 'B', 'C', 'D', 'E', 'F'];

export function buatQuiz({ els, onJawab, onTutup }) {
  let state = { soal: null, pemainId: null, terkirim: false, tutupManual: false };

  function bersihkan() {
    els.opsi.innerHTML = '';
    els.feedback.classList.add('hidden');
    els.feedback.className = 'feedback hidden';
    els.btnTutup.classList.add('hidden');
    els.inputIsian.value = '';
    els.isianWrap.classList.add('hidden');
    els.opsi.classList.remove('hidden');
  }

  function buka({ soal, pemainId, urutan }) {
    state = { soal, pemainId, terkirim: false, urutan };
    bersihkan();

    els.kategori.textContent = soal.kategori || 'Umum';
    els.poin.textContent = soal.poin + ' poin';
    els.tipe.textContent = soal.tipe === 'pg' ? 'Pilihan Ganda' : 'Isian Singkat';
    els.pertanyaan.textContent = soal.pertanyaan;

    if (soal.tipe === 'pg') {
      // acak urutan opsi (deterministik per pemain+soal, stabil saat dibuka ulang)
      const rnd = acakSeeded(hashString(pemainId + '|' + soal.id));
      const idx = acakArray(soal.opsi.map((_, i) => i), rnd);
      state.petaIdx = idx;
      els.opsi.innerHTML = '';
      idx.forEach((asli, posisi) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opsi';
        b.dataset.asli = String(asli);
        b.innerHTML = `<span class="opsi-huruf">${HURUF[posisi]}</span><span></span>`;
        b.lastElementChild.textContent = soal.opsi[asli];
        b.addEventListener('click', () => kirim(asli, b));
        els.opsi.appendChild(b);
      });
      els.opsi.classList.remove('hidden');
      els.isianWrap.classList.add('hidden');
    } else {
      els.opsi.classList.add('hidden');
      els.isianWrap.classList.remove('hidden');
      setTimeout(() => els.inputIsian.focus(), 60);
    }
    els.modal.classList.remove('hidden');
  }

  async function kirim(jawaban, tombol) {
    if (state.terkirim || !state.soal) return;
    state.terkirim = true;

    if (tombol) tombol.disabled = true;
    Array.from(els.opsi.children).forEach((b) => { b.disabled = true; });
    els.btnKirim.disabled = true;
    els.inputIsian.disabled = true;

    try {
      const res = await api(`/api/players/${state.pemainId}/answer`, {
        method: 'POST',
        body: { questionId: state.soal.id, jawaban },
      });
      const h = res.hasil;

      // visual opsi: tandai kunci & pilihanmu
      if (state.soal.tipe === 'pg') {
        Array.from(els.opsi.children).forEach((b) => {
          const asli = Number(b.dataset.asli);
          if (asli === h.kunci) b.classList.add('benar');
        });
        if (!h.benar && tombol) tombol.classList.add('salah');
      }

      const fb = els.feedback;
      fb.classList.remove('hidden', 'f-benar', 'f-salah');
      fb.classList.add(h.benar ? 'f-benar' : 'f-salah');
      fb.innerHTML = '';

      const judul = document.createElement('div');
      judul.className = 'f-judul';
      judul.textContent = h.benar
        ? `Benar! +${h.poin} poin`
        : (res.sudahDijawab ? 'Soal ini sudah kamu jawab' : 'Belum tepat');
      fb.appendChild(judul);

      const kunci = document.createElement('div');
      kunci.className = 'f-kunci';
      if (h.benar) {
        kunci.innerHTML = `Skor kamu sekarang: <b>${h.skor}</b> · Progres benar <b>${h.benarTotal}/${h.total}</b>`;
      } else {
        const label = state.soal.tipe === 'pg' ? 'Kunci jawaban: ' : 'Jawaban yang benar: ';
        const isi = document.createElement('span');
        isi.textContent = label;
        const b = document.createElement('b');
        b.textContent = h.kunciTeks || '(kunci tidak tersedia)';
        isi.appendChild(b);
        kunci.appendChild(isi);
        const br = document.createElement('div');
        br.innerHTML = `Skor kamu: <b>${h.skor}</b> · Progres benar <b>${h.benarTotal}/${h.total}</b>`;
        kunci.appendChild(br);
      }
      fb.appendChild(kunci);

      els.btnTutup.classList.remove('hidden');
      els.btnTutup.focus();
      if (typeof onJawab === 'function') onJawab(state.soal, h, res.sudahDijawab);
    } catch (err) {
      state.terkirim = false;
      if (tombol) tombol.disabled = false;
      Array.from(els.opsi.children).forEach((b) => { b.disabled = false; });
      els.btnKirim.disabled = false;
      els.inputIsian.disabled = false;
      const fb = els.feedback;
      fb.classList.remove('hidden', 'f-benar', 'f-salah');
      fb.classList.add('f-salah');
      fb.innerHTML = `<div class="f-judul">Gagal menyimpan</div><div class="f-kunci"></div>`;
      fb.lastElementChild.textContent = err.message;
      if (typeof onJawab === 'function') onJawab(null, { gagal: true, pesan: err.message });
    }
  }

  function tutup() {
    els.modal.classList.add('hidden');
    state = { soal: null, pemainId: null, terkirim: false, tutupManual: false };
    if (typeof onTutup === 'function') onTutup();
  }

  els.btnKirim.addEventListener('click', () => {
    const v = els.inputIsian.value.trim();
    if (!v) {
      els.inputIsian.focus();
      return;
    }
    kirim(v, null);
  });
  els.inputIsian.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); els.btnKirim.click(); }
    e.stopPropagation();
  });
  els.btnTutup.addEventListener('click', tutup);

  return { buka, tutup, aktif: () => !els.modal.classList.contains('hidden') };
}
