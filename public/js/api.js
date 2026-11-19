/** api.js — pembungkus fetch JSON + penyimpanan sesi lokal. */

export async function api(path, { method = 'GET', body, token } = {}) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  if (token) opt.headers['Authorization'] = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(path, opt);
  } catch (e) {
    throw new Error('Tidak bisa terhubung ke server. Pastikan server berjalan.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* respons non-JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Terjadi kesalahan (' + res.status + ')');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Sesi pemain di localStorage ---------- */
const KEY_SESI = 'gp_sesi_pemain';
const KEY_IDENTITAS = 'gp_identitas';

export function simpanSesi(id) { localStorage.setItem(KEY_SESI, id); }
export function ambilSesi() { return localStorage.getItem(KEY_SESI); }
export function hapusSesi() { localStorage.removeItem(KEY_SESI); }

export function simpanIdentitas(data) {
  try { localStorage.setItem(KEY_IDENTITAS, JSON.stringify(data)); } catch (e) { /* abaikan */ }
}
export function ambilIdentitas() {
  try { return JSON.parse(localStorage.getItem(KEY_IDENTITAS) || 'null'); } catch (e) { return null; }
}

/* ---------- Util tampilan ---------- */
export function fmtDurasi(detik) {
  detik = Math.max(0, Math.floor(detik || 0));
  const j = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  const s = detik % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return j > 0 ? `${j}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function fmtWaktu(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

export function acakSeeded(seed) {
  // mulberry32 — pengacak deterministik agar posisi soal stabil antar refresh
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Acak array salinan secara deterministik berdasarkan seed. */
export function acakArray(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
