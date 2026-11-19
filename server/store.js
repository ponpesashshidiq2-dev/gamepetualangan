/**
 * store.js — Lapisan penyimpanan persisten berbasis file JSON.
 * Tidak memerlukan database eksternal, aman untuk shared hosting / server lokal.
 *
 * Skema:
 *  - questions.json : [{ id, pertanyaan, tipe: "pg"|"isian", opsi: [], kunci, poin, kategori, aktif, dibuat, diubah }]
 *  - players.json   : [{ id, nama, kelas, nis, kode_grup, skor, benar, salah, total, persen, detik,
 *                        status: "playing"|"done", mulai, selesai, jawaban: { [qid]: {dijawab,benar,poin,waktu} } }]
 *  - settings.json  : { acakPosisi: bool, packAktif: bool }
 *  - config.json    : { adminPassword: string }  (dibuat otomatis saat pertama jalan)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(__dirname, 'config.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error('[store] Gagal membaca', path.basename(file), err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file); // tulis atomik agar data tidak korup
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

/* ---------------- Soal ---------------- */
function getQuestions() {
  ensureDir();
  const list = readJson(path.join(DATA_DIR, 'questions.json'), []);
  return Array.isArray(list) ? list : [];
}
function saveQuestions(list) {
  writeJson(path.join(DATA_DIR, 'questions.json'), list);
}
function getActiveQuestions() {
  return getQuestions().filter((q) => q.aktif !== false);
}

/* ---------------- Pemain / Nilai ---------------- */
function getPlayers() {
  ensureDir();
  const list = readJson(path.join(DATA_DIR, 'players.json'), []);
  return Array.isArray(list) ? list : [];
}
function savePlayers(list) {
  writeJson(path.join(DATA_DIR, 'players.json'), list);
}
function getPlayer(id) {
  return getPlayers().find((p) => p.id === id) || null;
}
function updatePlayer(id, mutator) {
  const list = getPlayers();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  mutator(list[idx]);
  savePlayers(list);
  return list[idx];
}

/* ---------------- Pengaturan ---------------- */
const DEFAULT_SETTINGS = { acakPosisi: true, packAktif: true };
function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, readJson(path.join(DATA_DIR, 'settings.json'), {}));
}
function saveSettings(patch) {
  const next = Object.assign({}, getSettings(), patch);
  writeJson(path.join(DATA_DIR, 'settings.json'), next);
  return next;
}

/* ---------------- Konfigurasi admin ---------------- */
function getConfig() {
  let cfg = readJson(CONFIG_PATH, null);
  if (!cfg || typeof cfg.adminPassword !== 'string' || !cfg.adminPassword) {
    cfg = { adminPassword: 'admin123' };
    writeJson(CONFIG_PATH, cfg);
  }
  return cfg;
}
function saveConfig(patch) {
  const next = Object.assign({}, getConfig(), patch);
  writeJson(CONFIG_PATH, next);
  return next;
}

function tokenFor(password) {
  return crypto.createHash('sha256').update('petualangan-admin|' + password).digest('hex');
}

module.exports = {
  uid,
  getQuestions, saveQuestions, getActiveQuestions,
  getPlayers, savePlayers, getPlayer, updatePlayer,
  getSettings, saveSettings,
  getConfig, saveConfig, tokenFor,
};
