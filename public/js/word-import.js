/**
 * word-import.js — mengurai soal dari hasil tempelan Microsoft Word.
 *
 * Mendukung dua sumber:
 *  1. Teks biasa (copy-paste dari Word sebagai plain text)
 *  2. HTML clipboard Word — opsi yang ditebal/digarisbawahi otomatis
 *     ditandai sebagai kunci jawaban.
 *
 * Format yang dikenali (disarankan):
 *
 *   1. Berapa hasil 2+2?
 *   A. 3
 *   B. 4
 *   C. 5
 *   D. 6
 *   Kunci: B
 *   Poin: 10
 *   Kategori: Matematika
 *
 *   2. Ibu kota Jepang?
 *   A. Seoul
 *   B. Tokyo
 *   Kunci: B
 *
 *   3. Satuan SI gaya?
 *   Kunci: newton        ← tanpa opsi = isian singkat
 *
 * Catatan:
 *  - Soal dipisah baris kosong ATAU diawali nomor (1. 2. 3.) ATAU setelah baris Kunci.
 *  - Kunci berupa huruf (A–F), angka urut opsi, atau teks jawaban.
 *  - Tanda * di depan opsi (atau teks tebal/garisbawahi dari Word) = kunci.
 */

const RE_OPSI = /^\s*\*?\s*([A-Fa-f])\s*[.)\]]\s*(.*)$/;
const RE_NUM = /^\s*(\d+)\s*[.)]\s+(.*)$/;
const RE_KUNCI = /^\s*(kunci|jawaban|answer|kunci jawaban)\s*[:\-–—]\s*(.*)$/i;
const RE_POIN = /^\s*(poin|skor|score)\s*[:\-–—]?\s*(\d+)\s*$/i;
const RE_KAT = /^\s*(kategori|topik|topic|bidang)\s*[:\-–—]\s*(.*)$/i;
const RE_PEMISAH = /^\s*(-{3,}|={3,}|\*{3,})\s*$/;
const RE_LABEL_NUM = /^\s*(?:soal|pertanyaan)\s*(\d+)\s*[.):\-–—]\s*(.*)$/i;
const RE_LABEL = /^\s*soal\s*[.):\-–—]\s*(.*)$/i;
const RE_BINTANG_DEPAN = /^\s*\*\s*/;

/** Deteksi format data import dari teks yang ditempel/dipilih. */
export function deteksiFormatImport(teks) {
  const t = String(teks || '').replace(/^\uFEFF/, '').trim();
  if (!t) return null;
  if (t[0] === '[' || t[0] === '{') return 'json';
  const barisPertama = t.split('\n')[0].toLowerCase();
  if (barisPertama.includes('pertanyaan') && barisPertama.includes('tipe')) return 'csv';
  return 'word';
}

/**
 * Ubah HTML (clipboard Word) menjadi teks baris-per-paragraf.
 * Opsi yang seluruh isinya tebal/garisbawahi diberi penanda "* ".
 */
export function htmlKeTeks(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const body = doc.body;
  body.querySelectorAll('style,script,meta,link').forEach((n) => n.remove());

  const lines = [];
  let pending = '';
  let pendingTanda = false;

  function gayaTerpasang(node) {
    let n = node.parentNode; // mulai dari elemen pembungkus teks
    while (n && n.nodeType === 1 && n !== body) {
      const tag = n.nodeName;
      if (tag === 'B' || tag === 'STRONG' || tag === 'U' || tag === 'INS') return true;
      const st = typeof n.getAttribute === 'function' ? (n.getAttribute('style') || '') : '';
      if (/(font-weight\s*:\s*(bold|[6-9]00))|(text-decoration[^;]*underline)/i.test(st)) return true;
      n = n.parentNode;
    }
    return false;
  }

  function flush() {
    const teks = pending.replace(/[ \t]+/g, ' ').trim();
    if (teks) lines.push({ teks, tanda: pendingTanda });
    pending = '';
    pendingTanda = false;
  }

  function walk(node) {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) {
        pending += ch.nodeValue.replace(/\u00a0/g, ' ');
        if (ch.nodeValue.trim() && gayaTerpasang(ch)) pendingTanda = true;
      } else if (ch.nodeName === 'BR') {
        flush();
      } else if (ch.nodeType === 1) {
        const tag = ch.nodeName;
        if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'META' || tag === 'LINK' || tag === 'O:P') continue;
        const blok = /^(P|DIV|H1|H2|H3|H4|H5|H6|LI|TR|BLOCKQUOTE|PRE|TD|TH|SECTION|ARTICLE|FIGURE|FIGCAPTION|TABLE)$/.test(tag);
        if (blok) {
          flush();
          walk(ch);
          flush();
        } else {
          walk(ch);
        }
      }
    }
  }
  walk(body);
  flush();

  return lines
    .map((l) => {
      const polos = l.teks.replace(RE_BINTANG_DEPAN, '');
      if (l.tanda && /^\s*[A-Fa-f]\s*[.)\]]/.test(polos)) return '* ' + polos;
      return polos;
    })
    .join('\n');
}

/* ---------------- helper internal ---------------- */

function barisBerikutnyaBukanKosong(baris, i) {
  for (let j = i + 1; j < baris.length; j++) {
    const t = baris[j].trim();
    if (t) return t;
  }
  return '';
}

/** Selesaikan satu soal menjadi objek siap kirim; return null bila kosong/tidak valid. */
function finalisasi(cur, nomor, errors) {
  const punyaIsi = cur.pertanyaan || cur.opsi.length || (cur.kunci !== null && cur.kunci !== '');
  if (!punyaIsi) return null;

  const nama = 'Soal ' + nomor;
  if (cur.pertanyaan.length < 2) {
    errors.push(`${nama}: teks pertanyaan kosong.`);
    return null;
  }

  const tipe = cur.opsi.length >= 2 ? 'pg' : 'isian';
  let kunci = null;

  if (tipe === 'pg') {
    const raw = String(cur.kunci ?? '').trim();
    if (!raw && cur.ditandai.length === 1) {
      kunci = resolveKunci(cur.ditandai[0], cur);
    } else if (!raw && cur.ditandai.length > 1) {
      errors.push(`${nama}: lebih dari satu opsi ditandai sebagai kunci.`);
      return null;
    } else if (!raw) {
      errors.push(`${nama}: kunci jawaban tidak ditemukan (tulis "Kunci: A" atau tebal opsi yang benar).`);
      return null;
    } else {
      kunci = resolveKunci(raw, cur);
      if (kunci === null) {
        // serahkan ke server (pencocokan teks); bila tetap tidak cocok server yang melaporkan
        kunci = raw;
      }
    }
  } else {
    kunci = String(cur.kunci ?? '').trim();
    if (!kunci) {
      errors.push(`${nama}: kunci jawaban isian tidak ditemukan (tulis "Jawaban: ...").`);
      return null;
    }
  }

  const obj = {
    pertanyaan: cur.pertanyaan.trim(),
    tipe,
    opsi: cur.opsi.map((o) => o.teks),
    kunci,
    kategori: cur.kategori,
    aktif: true,
  };
  if (cur.poin !== null) obj.poin = cur.poin;
  return obj;
}

/** Ubah kunci (huruf/angka/teks) menjadi index opsi, atau null bila tidak cocok. */
function resolveKunci(raw, cur) {
  const s = String(raw).trim();
  const n = cur.opsi.length;
  if (!s) return null;

  if (/^[A-Fa-f]$/.test(s)) {
    const huruf = s.toUpperCase();
    const byLabel = cur.opsi.findIndex((o) => String(o.label || '').toUpperCase() === huruf);
    if (byLabel >= 0) return byLabel;
    const ord = huruf.charCodeAt(0) - 65;
    return ord >= 0 && ord < n ? ord : null;
  }
  if (/^\d+$/.test(s)) {
    const d = Number(s);
    const byLabel = cur.opsi.findIndex((o) => String(o.label || '') === s);
    if (byLabel >= 0) return byLabel;
    if (d >= 1 && d <= n) return d - 1; // angka = nomor opsi (1-based, "Kunci: 2" = opsi kedua)
    if (d >= 0 && d < n) return d;
    return null;
  }
  return null; // teks — biarkan server mencocokkan
}

/**
 * Parse teks tempelan Word/CSV-like menjadi daftar soal.
 * @returns {{soal: Array, errors: string[], stats: {total:number, pg:number, isian:number}}}
 */
export function parseSoalDariTeks(teks) {
  const errors = [];
  const soal = [];
  const src = String(teks ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const baris = src.split('\n');
  const implisit = !baris.some((b) => RE_OPSI.test(b));

  const baru = () => ({ pertanyaan: '', opsi: [], labels: [], kunci: null, poin: null, kategori: '', ditandai: [] });
  let cur = baru();
  let nomor = 0;

  function selesai() {
    nomor++;
    const obj = finalisasi(cur, nomor, errors);
    if (obj) soal.push(obj);
    cur = baru();
  }

  for (let i = 0; i < baris.length; i++) {
    const t = baris[i].replace(/\u00a0/g, ' ').replace(/^\s+/, '').replace(/\s+$/, '');
    if (!t) { if (cur.pertanyaan || cur.opsi.length || cur.kunci !== null) selesai(); continue; }
    if (RE_PEMISAH.test(t)) { if (cur.pertanyaan || cur.opsi.length || cur.kunci !== null) selesai(); continue; }

    const mK = t.match(RE_KUNCI);
    if (mK) {
      if (!cur.pertanyaan) { errors.push(`Baris ${i + 1}: baris kunci tanpa pertanyaan — dilewati.`); continue; }
      cur.kunci = mK[2].trim();
      continue;
    }

    const mP = t.match(RE_POIN);
    if (mP) { cur.poin = Number(mP[2]); continue; }

    const mKat = t.match(RE_KAT);
    if (mKat) { cur.kategori = mKat[2].trim(); continue; }

    const mO = t.match(RE_OPSI);
    if (mO) {
      if (!cur.pertanyaan) { errors.push(`Baris ${i + 1}: opsi sebelum pertanyaan — dilewati.`); continue; }
      if (cur.kunci !== null) { errors.push(`Baris ${i + 1}: opsi muncul setelah baris kunci — dilewati.`); continue; }
      const label = mO[1].toUpperCase();
      cur.opsi.push({ label, teks: mO[2].trim() });
      if (RE_BINTANG_DEPAN.test(t)) cur.ditandai.push(label);
      continue;
    }

    const mLN = t.match(RE_LABEL_NUM);
    const mL2 = !mLN ? t.match(RE_LABEL) : null;
    if (mLN || mL2) {
      if (cur.pertanyaan || cur.opsi.length || cur.kunci !== null) selesai();
      cur.pertanyaan = mLN ? (mLN[2] || '') : (mL2[1] || '');
      continue;
    }

    const mN = t.match(RE_NUM);
    if (mN) {
      const nomorBaris = mN[1];
      const isi = mN[2].trim();
      if (!cur.pertanyaan && !cur.opsi.length && cur.kunci === null) {
        cur.pertanyaan = isi;
        continue;
      }
      if (cur.pertanyaan && cur.kunci === null) {
        // Lanjutkan sebagai opsi bernomor bila pola menunjukkan daftar bernomor
        const terakhir = cur.opsi.length ? String(cur.opsi[cur.opsi.length - 1].label || '') : '';
        const berikutnya = barisBerikutnyaBukanKosong(baris, i);
        const daftarBernomor = cur.opsi.length === 0
          ? (berikutnya !== '' && RE_NUM.test(berikutnya) && !RE_KUNCI.test(berikutnya))
          : /^\d+$/.test(terakhir);
        if (daftarBernomor) {
          cur.opsi.push({ label: nomorBaris, teks: isi });
          continue;
        }
      }
      selesai();
      cur.pertanyaan = isi;
      continue;
    }

    // Baris biasa
    if (!cur.pertanyaan) {
      cur.pertanyaan = t;
      continue;
    }
    if (implisit && cur.kunci === null) {
      // Mode implisit (tanpa penanda A./B.): baris biasa = opsi sampai baris Kunci
      cur.opsi.push({ label: null, teks: t });
      continue;
    }
    if (!cur.opsi.length && cur.kunci === null) {
      cur.pertanyaan += ' ' + t;
      continue;
    }
    // Sudah ada isi (opsi/kunci) → kemungkinan soal baru tanpa nomor
    selesai();
    cur.pertanyaan = t;
  }
  selesai();

  const stats = {
    total: soal.length,
    pg: soal.filter((q) => q.tipe === 'pg').length,
    isian: soal.filter((q) => q.tipe === 'isian').length,
  };
  return { soal, errors, stats };
}
