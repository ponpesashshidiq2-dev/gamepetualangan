/**
 * server.js — REST API ringan + server statis (tanpa dependensi eksternal).
 * Jalankan : node server.js        (atau: npm start)
 * Alamat   : http://localhost:3000  (pemain)  |  http://localhost:3000/admin  (panel admin)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

/* ============================ Util ============================ */
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers));
  res.end(body);
}
function sendFile(res, status, filePath, headers = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, buf) => {
    if (err) return send(res, 404, { ok: false, error: 'File tidak ditemukan' });
    res.writeHead(status, Object.assign({ 'Content-Type': mime, 'Cache-Control': 'no-cache' }, headers));
    res.end(buf);
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) { reject(Object.assign(new Error('Payload terlalu besar'), { code: 'LIMIT' })); req.destroy(); return; }
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(Object.assign(new Error('Body JSON tidak valid'), { code: 'BADJSON' })); }
    });
    req.on('error', reject);
  });
}
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
const ok = (a, b) => norm(a) === norm(b);

/* ============================ CSV ============================ */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rows) {
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/* ==================== Validasi / normalisasi soal ==================== */
function validateQuestion(input, existing = []) {
  const errs = [];
  const q = {
    id: input.id || store.uid('q'),
    pertanyaan: String(input.pertanyaan || '').trim(),
    tipe: input.tipe === 'isian' ? 'isian' : 'pg',
    opsi: [],
    kunci: input.kunci,
    poin: Math.max(0, Math.round(Number(input.poin) || 10)),
    kategori: String(input.kategori || '').trim(),
    aktif: input.aktif === undefined ? true : !!input.aktif,
    dibuat: input.dibuat || new Date().toISOString(),
    diubah: new Date().toISOString(),
  };
  if (q.pertanyaan.length < 2) errs.push('Pertanyaan wajib diisi.');

  if (q.tipe === 'pg') {
    const opsi = (Array.isArray(input.opsi) ? input.opsi : []).map((o) => String(o || '').trim()).filter(Boolean);
    q.opsi = opsi.slice(0, 6);
    if (q.opsi.length < 2) errs.push('Pilihan ganda butuh minimal 2 opsi jawaban.');
    let k = input.kunci;
    if (typeof k === 'string') {
      const idx = Number(k);
      if (/^\d+$/.test(k.trim()) && idx >= 0 && idx < q.opsi.length) k = idx;
      else k = q.opsi.findIndex((o) => ok(o, k));
    }
    if (typeof k !== 'number' || k < 0 || k >= q.opsi.length) errs.push('Kunci jawaban tidak cocok dengan salah satu opsi.');
    else q.kunci = k;
  } else {
    const kunci = Array.isArray(input.kunci)
      ? input.kunci.join('|')
      : String(input.kunci || '').trim();
    q.kunci = kunci;
    if (!kunci) errs.push('Kunci jawaban isian singkat wajib diisi.');
    if (Array.isArray(input.opsi)) q.opsi = input.opsi.map(String).filter(Boolean).slice(0, 6);
  }
  if (errs.length) return { error: errs.join(' ') };
  return { question: q };
}

function questionToCSVRow(q) {
  return [
    q.id, q.pertanyaan, q.tipe,
    q.tipe === 'pg' ? (q.opsi[0] || '') : (q.opsi[0] || ''),
    q.opsi[1] || '', q.opsi[2] || '', q.opsi[3] || '',
    q.tipe === 'pg' ? (q.opsi[q.kunci] ?? '') : q.kunci,
    q.poin, q.kategori, q.aktif ? 'ya' : 'tidak',
  ];
}
const CSV_HEADER = ['id', 'pertanyaan', 'tipe', 'opsi1', 'opsi2', 'opsi3', 'opsi4', 'kunci', 'poin', 'kategori', 'aktif'];

function csvRowToQuestion(cols) {
  const get = (i) => (cols[i] || '').trim();
  const opsi = [get(3), get(4), get(5), get(6)].filter(Boolean);
  return {
    id: get(0) || undefined,
    pertanyaan: get(1),
    tipe: get(2).toLowerCase() === 'isian' ? 'isian' : 'pg',
    opsi,
    kunci: get(7),
    poin: Number(get(8)) || 10,
    kategori: get(9),
    aktif: ['tidak', 'no', 'false', '0', 'nonaktif'].indexOf(get(10).toLowerCase()) === -1,
  };
}

/* ============================ Auth admin ============================ */
function authAdmin(req) {
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  const expected = store.tokenFor(store.getConfig().adminPassword);
  if (!token || token.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8')); }
  catch { return false; }
}

/* ==================== Statistik pemain (real-time) ==================== */
function decorate(p) {
  const total = p.total || 0;
  const persen = p.status === 'done' ? (p.persen || 0) : (total ? Math.round((p.benar / total) * 100) : 0);
  const detik = p.status === 'done' ? (p.detik || 0) : Math.max(0, Math.floor((Date.now() - new Date(p.mulai).getTime()) / 1000));
  return Object.assign({}, p, { persen, detik });
}

/* ============================ Router ============================ */
async function handleAPI(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;

  /* ---------- Publik: konfigurasi game ---------- */
  if (method === 'GET' && url.pathname === '/api/game/config') {
    const s = store.getSettings();
    const soal = s.packAktif ? store.getActiveQuestions() : [];
    return send(res, 200, {
      ok: true,
      settings: s,
      soal: soal.map((q) => ({ id: q.id, pertanyaan: q.pertanyaan, tipe: q.tipe, opsi: q.opsi, poin: q.poin, kategori: q.kategori })),
      total: soal.length,
    });
  }

  /* ---------- Publik: sesi pemain ---------- */
  if (seg[1] === 'players') {
    const active = store.getActiveQuestions();
    const totalSoal = active.length;

    if (method === 'POST' && seg.length === 2) {
      const body = await readBody(req);
      const nama = String(body.nama || '').trim();
      if (nama.length < 2) return send(res, 400, { ok: false, error: 'Nama lengkap wajib diisi (min. 2 karakter).' });
      const p = {
        id: store.uid('p'),
        nama: nama.slice(0, 80),
        kelas: String(body.kelas || '').trim().slice(0, 40),
        nis: String(body.nis || '').trim().slice(0, 40),
        kode_grup: String(body.kode_grup || '').trim().slice(0, 40),
        skor: 0, benar: 0, salah: 0, total: totalSoal, persen: 0, detik: 0,
        status: 'playing',
        mulai: new Date().toISOString(),
        selesai: null,
        jawaban: {},
      };
      const list = store.getPlayers();
      list.push(p);
      store.savePlayers(list);
      return send(res, 201, { ok: true, pemain: decorate(p) });
    }

    if (seg.length >= 3) {
      const id = seg[2];
      const p = store.getPlayer(id);
      if (!p) return send(res, 404, { ok: false, error: 'Sesi permainan tidak ditemukan (mungkin sudah direset admin).' });

      if (seg.length === 3 && method === 'GET') return send(res, 200, { ok: true, pemain: decorate(p) });

      if (method === 'DELETE') {
        const list = store.getPlayers().filter((x) => x.id !== id);
        store.savePlayers(list);
        return send(res, 200, { ok: true, message: 'Sesi dihapus. Mulai permainan baru.' });
      }

      if (seg.length === 4 && method === 'POST' && seg[3] === 'answer') {
        if (p.status === 'done') return send(res, 400, { ok: false, error: 'Sesi ini sudah selesai. Mulai permainan baru.' });
        const body = await readBody(req);
        const q = active.find((x) => x.id === body.questionId);
        if (!q) return send(res, 404, { ok: false, error: 'Soal tidak ditemukan atau sudah dinonaktifkan.' });
        if (p.jawaban[q.id]) {
          return send(res, 200, { ok: true, sudahDijawab: true, hasil: p.jawaban[q.id], skor: p.skor, benarTotal: p.benar, salahTotal: p.salah, total: p.total, persen: decorate(p).persen });
        }
        const jawaban = q.tipe === 'pg' ? Number(body.jawaban) : String(body.jawaban ?? '').trim();
        if (q.tipe === 'pg' && (!Number.isInteger(jawaban) || jawaban < 0 || jawaban >= q.opsi.length))
          return send(res, 400, { ok: false, error: 'Pilihan jawaban tidak valid.' });
        if (q.tipe === 'isian' && !String(jawaban)) return send(res, 400, { ok: false, error: 'Jawaban belum diisi.' });

        const benar = q.tipe === 'pg' ? jawaban === q.kunci : ok(jawaban, String(q.kunci).split('|')[0]) ||
          String(q.kunci).split('|').some((alt) => ok(jawaban, alt));
        const poin = benar ? q.poin : 0;
        const rec = { dijawab: jawaban, benar, poin, waktu: new Date().toISOString() };

        const updated = store.updatePlayer(p.id, (pl) => {
          pl.jawaban[q.id] = rec;
          pl.skor += poin;
          if (benar) pl.benar += 1; else pl.salah += 1;
          pl.total = totalSoal;
        });
        const hasil = {
          benar, poin, rec,
          kunci: q.kunci,
          kunciTeks: q.tipe === 'pg' ? (q.opsi[q.kunci] ?? '') : String(q.kunci).split('|')[0],
          opsi: q.opsi,
          skor: updated.skor, benarTotal: updated.benar, salahTotal: updated.salah,
          total: totalSoal, persen: decorate(updated).persen,
        };
        return send(res, 200, { ok: true, sudahDijawab: false, hasil });
      }

      if (seg.length === 4 && method === 'POST' && seg[3] === 'finish') {
        const updated = store.updatePlayer(p.id, (pl) => {
          pl.status = 'done';
          pl.selesai = new Date().toISOString();
          pl.total = totalSoal;
          pl.persen = totalSoal ? Math.round((pl.benar / totalSoal) * 100) : 0;
          pl.detik = Math.max(0, Math.floor((new Date(pl.selesai).getTime() - new Date(pl.mulai).getTime()) / 1000));
        });
        return send(res, 200, { ok: true, pemain: decorate(updated) });
      }
    }
    return send(res, 404, { ok: false, error: 'Endpoint tidak ditemukan.' });
  }

  /* ---------- Admin ---------- */
  if (seg[1] === 'admin') {
    if (method === 'POST' && url.pathname === '/api/admin/login') {
      const body = await readBody(req);
      const pass = String(body.password || '');
      const expected = store.getConfig().adminPassword;
      const a = crypto.createHash('sha256').update(pass).digest();
      const b = crypto.createHash('sha256').update(expected).digest();
      const match = crypto.timingSafeEqual(a, b);
      if (!match) return send(res, 401, { ok: false, error: 'Password salah.' });
      return send(res, 200, { ok: true, token: store.tokenFor(expected) });
    }

    if (!authAdmin(req)) return send(res, 401, { ok: false, error: 'Token admin tidak valid. Silakan login ulang.' });

    /* --- Soal (CRUD) --- */
    if (seg[1] === 'admin' && seg[2] === 'questions') {
      const list = store.getQuestions();

      if (method === 'GET' && seg.length === 3) return send(res, 200, { ok: true, soal: list });

      if (method === 'GET' && seg[3] === 'export') {
        const format = (url.searchParams.get('format') || 'json').toLowerCase();
        if (format === 'csv') {
          const rows = [CSV_HEADER].concat(list.map(questionToCSVRow));
          return send(res, 200, toCSV(rows), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="soal.csv"' });
        }
        return send(res, 200, JSON.stringify(list, null, 2), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="soal.json"' });
      }

      if (method === 'POST' && seg[3] === 'import') {
        const body = await readBody(req);
        const mode = body.mode === 'merge' ? 'merge' : 'replace';
        const format = body.format === 'csv' ? 'csv' : 'json';
        let items = [];
        try {
          if (format === 'csv') {
            items = parseCSV(String(body.data || '')).slice(1).map(csvRowToQuestion);
          } else {
            const parsed = JSON.parse(String(body.data || '[]'));
            items = Array.isArray(parsed) ? parsed : (parsed.soal || []);
          }
        } catch (e) {
          return send(res, 400, { ok: false, error: 'Gagal memparsing file: ' + e.message });
        }
        if (!Array.isArray(items) || !items.length) return send(res, 400, { ok: false, error: 'Tidak ada data soal di dalam file.' });

        const errors = [];
        const hasil = [];
        items.forEach((it, i) => {
          const r = validateQuestion(it, list);
          if (r.error) errors.push(`Baris ${i + 1}: ${r.error}`);
          else hasil.push(r.question);
        });

        if (mode === 'replace') {
          store.saveQuestions(hasil);
          return send(res, 200, { ok: true, ditambah: hasil.length, diperbarui: 0, errors, total: hasil.length });
        }
        const current = store.getQuestions();
        let added = 0, updated = 0;
        hasil.forEach((q) => {
          const idx = current.findIndex((x) => x.id === q.id || x.pertanyaan === q.pertanyaan);
          if (idx >= 0) { q.id = current[idx].id; q.dibuat = current[idx].dibuat; current[idx] = q; updated++; }
          else { current.push(q); added++; }
        });
        store.saveQuestions(current);
        return send(res, 200, { ok: true, ditambah: added, diperbarui: updated, errors, total: current.length });
      }

      if (method === 'POST' && seg.length === 3) {
        const body = await readBody(req);
        const r = validateQuestion(body);
        if (r.error) return send(res, 400, { ok: false, error: r.error });
        list.push(r.question);
        store.saveQuestions(list);
        return send(res, 201, { ok: true, soal: r.question });
      }

      if (seg.length === 4 && method === 'DELETE') {
        const idx = list.findIndex((q) => q.id === seg[3]);
        if (idx === -1) return send(res, 404, { ok: false, error: 'Soal tidak ditemukan.' });
        list.splice(idx, 1);
        store.saveQuestions(list);
        return send(res, 200, { ok: true, message: 'Soal dihapus.' });
      }

      if (seg.length === 4 && method === 'PUT') {
        const idx = list.findIndex((q) => q.id === seg[3]);
        if (idx === -1) return send(res, 404, { ok: false, error: 'Soal tidak ditemukan.' });
        const body = await readBody(req);
        const r = validateQuestion(Object.assign({}, list[idx], body, { id: list[idx].id, dibuat: list[idx].dibuat }));
        if (r.error) return send(res, 400, { ok: false, error: r.error });
        list[idx] = r.question;
        store.saveQuestions(list);
        return send(res, 200, { ok: true, soal: r.question });
      }
    }

    /* --- Pengaturan + ganti password --- */
    if (url.pathname === '/api/admin/settings') {
      if (method === 'GET') return send(res, 200, { ok: true, settings: store.getSettings() });
      if (method === 'PUT') {
        const body = await readBody(req);
        const patch = {};
        if (typeof body.acakPosisi === 'boolean') patch.acakPosisi = body.acakPosisi;
        if (typeof body.packAktif === 'boolean') patch.packAktif = body.packAktif;
        const s = store.saveSettings(patch);
        let token = null;
        if (typeof body.password === 'string' && body.password.length >= 6) {
          store.saveConfig({ adminPassword: body.password });
          token = store.tokenFor(body.password);
        }
        return send(res, 200, { ok: true, settings: s, token, message: token ? 'Password diperbarui.' : 'Pengaturan disimpan.' });
      }
    }

    /* --- Daftar nilai --- */
    if (url.pathname === '/api/admin/scores') {
      if (method === 'GET') {
        const players = store.getPlayers().map(decorate)
          .sort((a, b) => (b.skor - a.skor) || (new Date(b.mulai) - new Date(a.mulai)));
        return send(res, 200, { ok: true, nilai: players });
      }
      if (method === 'DELETE' && seg.length === 3) {
        const n = store.getPlayers().length;
        store.savePlayers([]);
        return send(res, 200, { ok: true, message: `${n} data nilai direset.` });
      }
      if (method === 'DELETE' && seg.length === 4) {
        const before = store.getPlayers().length;
        store.savePlayers(store.getPlayers().filter((p) => p.id !== seg[3]));
        return send(res, 200, { ok: true, message: before === store.getPlayers().length ? 'Data tidak ditemukan.' : 'Data nilai dihapus.' });
      }
    }

    return send(res, 404, { ok: false, error: 'Endpoint admin tidak ditemukan.' });
  }

  return send(res, 404, { ok: false, error: 'Endpoint tidak ditemukan.' });
}

/* ============================ Server ============================ */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (url.pathname.startsWith('/api/')) {
    handleAPI(req, res, url).catch((err) => {
      const status = err.code === 'LIMIT' ? 413 : err.code === 'BADJSON' ? 400 : 500;
      send(res, status, { ok: false, error: err.message || 'Terjadi kesalahan server.' });
    });
    return;
  }

  // Statis
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  else if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  const filePath = path.join(PUBLIC_DIR, rel);
  if (path.relative(PUBLIC_DIR, filePath).startsWith('..')) return send(res, 403, { ok: false, error: 'Akses ditolak.' });
  fs.stat(filePath, (err, st) => {
    if (!err && st.isFile()) return sendFile(res, 200, filePath);
    if (!err && st.isDirectory()) return sendFile(res, 200, path.join(filePath, 'index.html'));
    send(res, 404, { ok: false, error: 'File tidak ditemukan' }, { 'Content-Type': 'text/plain; charset=utf-8' });
  });
});

server.listen(PORT, () => {
  const cfg = store.getConfig();
  console.log('==================================================');
  console.log('  Game 3D Petualangan Edukasi — server berjalan');
  console.log('  Pemain : http://localhost:' + PORT + '/');
  console.log('  Admin  : http://localhost:' + PORT + '/admin');
  console.log('  Password admin: ' + cfg.adminPassword);
  console.log('==================================================');
});
