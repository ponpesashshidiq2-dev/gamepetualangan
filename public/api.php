<?php
/**
 * api.php — REST API Game Petualangan (pengganti server Node.js).
 * Cukup upload isi folder ini ke hosting PHP (cPanel/shared hosting).
 *
 * Routing via ?r= (contoh: api.php?r=game/config).
 * Metode: GET untuk baca, POST untuk tulis; PUT/DELETE dikirim sebagai
 * POST + field _method agar kompatibel dengan semua hosting.
 *
 * Data disimpan sebagai file JSON di folder data/ — folder data dibuat
 * DI LUAR root web bila memungkinkan (aman), fallback ke public/data/
 * yang dilindungi .htaccess.
 */
declare(strict_types=1);

/* ============================ Util dasar ============================ */
function kirim(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function ok200(array $data): void { kirim(200, $data); }
function gagal(int $status, string $pesan): void { kirim($status, ['ok' => false, 'error' => $pesan]); }

function uid(string $prefix): string {
    $ms = (int)floor(microtime(true) * 1000);
    return $prefix . '_' . base_convert((string)$ms, 10, 36) . bin2hex(random_bytes(4));
}

function norm($s): string {
    $s = strtolower(trim((string)$s));
    $s = preg_replace('/\s+/', ' ', $s) ?? $s;
    return (string)preg_replace('/[.!?]+$/', '', $s);
}
function sama($a, $b): bool { return norm($a) === norm($b); }

/* ============================ Penyimpanan ============================ */
function folderData(): string {
    static $dir = null;
    if ($dir !== null) return $dir;
    // Kandidat 1: DI LUAR root web (dirname(__DIR__) = induk folder public/)
    // Kandidat 2: fallback public/data (dilindungi .htaccess)
    $kandidat = [dirname(__DIR__) . '/gp_data', __DIR__ . '/data'];
    foreach ($kandidat as $c) {
        if (!is_dir($c)) @mkdir($c, 0775, true);
        if (is_dir($c) && is_writable($c)) {
            $uji = $c . '/.uji-tulis';
            if (@file_put_contents($uji, '1') !== false) {
                @unlink($uji);
                // Perlindungan tambahan bila folder kebetulan berada di root web (Apache)
                $ht = $c . '/.htaccess';
                if (!file_exists($ht)) {
                    @file_put_contents($ht, "Require all denied\nDeny from all\n");
                }
                $dir = $c;
                return $dir;
            }
        }
    }
    gagal(500, 'Folder data tidak bisa ditulis server. Pastikan hosting mengizinkan penulisan file (permission 755/775).');
}

function bacaJson(string $file, $fallback) {
    if (!file_exists($file)) return $fallback;
    $raw = trim((string)@file_get_contents($file));
    if ($raw === '') return $fallback;
    $v = json_decode($raw, true);
    if (!is_array($v) && json_last_error() !== JSON_ERROR_NONE) return $fallback;
    return $v;
}
function tulisJson(string $file, $data): void {
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    rename($tmp, $file); // tulis atomik agar data tidak korup
}

function pathSoal(): string { return folderData() . '/questions.json'; }
function pathPemain(): string { return folderData() . '/players.json'; }
function pathSetelan(): string { return folderData() . '/settings.json'; }
function pathConfig(): string { return folderData() . '/config.json'; }

/** Soal bawaan saat pertama kali dijalankan. */
function soalBawaan(): array {
    $waktu = gmdate('c');
    $bawaan = [
        ['id' => 'q_demo1', 'pertanyaan' => 'Berapa hasil dari 2 + 2?', 'tipe' => 'pg',
         'opsi' => ['3', '4', '5', '6'], 'kunci' => 1, 'poin' => 10, 'kategori' => 'Matematika', 'aktif' => true],
        ['id' => 'q_demo2', 'pertanyaan' => 'Ibu kota negara Jepang adalah...', 'tipe' => 'pg',
         'opsi' => ['Seoul', 'Tokyo', 'Bangkok', 'Beijing'], 'kunci' => 1, 'poin' => 10, 'kategori' => 'Umum', 'aktif' => true],
        ['id' => 'q_demo3', 'pertanyaan' => 'Satuan SI untuk gaya adalah...', 'tipe' => 'isian',
         'opsi' => [], 'kunci' => 'newton', 'poin' => 10, 'kategori' => 'Fisika', 'aktif' => true],
    ];
    foreach ($bawaan as &$q) { $q['dibuat'] = $waktu; $q['diubah'] = $waktu; }
    return $bawaan;
}

function siapkanData(): void {
    if (!file_exists(pathSoal())) tulisJson(pathSoal(), soalBawaan());
    if (!file_exists(pathPemain())) tulisJson(pathPemain(), []);
    if (!file_exists(pathSetelan())) tulisJson(pathSetelan(), ['acakPosisi' => true, 'packAktif' => true]);
    if (!file_exists(pathConfig())) tulisJson(pathConfig(), ['adminPassword' => 'admin123']);
}

function daftarSoal(): array {
    $l = bacaJson(pathSoal(), []);
    return is_array($l) ? array_values($l) : [];
}
function simpanSoal(array $list): void { tulisJson(pathSoal(), array_values($list)); }
function soalAktif(): array {
    return array_values(array_filter(daftarSoal(), fn($q) => ($q['aktif'] ?? true) !== false));
}
function daftarPemain(): array {
    $l = bacaJson(pathPemain(), []);
    return is_array($l) ? array_values($l) : [];
}
function simpanPemain(array $list): void { tulisJson(pathPemain(), array_values($list)); }
function cariPemain(string $id): ?array {
    foreach (daftarPemain() as $p) if (($p['id'] ?? '') === $id) return $p;
    return null;
}
function setelan(): array {
    return array_merge(['acakPosisi' => true, 'packAktif' => true], (array)bacaJson(pathSetelan(), []));
}
function simpanSetelan(array $patch): array {
    $next = array_merge(setelan(), $patch);
    tulisJson(pathSetelan(), $next);
    return $next;
}
function config(): array {
    $c = bacaJson(pathConfig(), null);
    if (!is_array($c) || !isset($c['adminPassword']) || $c['adminPassword'] === '') {
        $c = ['adminPassword' => 'admin123'];
        tulisJson(pathConfig(), $c);
    }
    return $c;
}
function simpanConfig(array $patch): array {
    $next = array_merge(config(), $patch);
    tulisJson(pathConfig(), $next);
    return $next;
}
function tokenDariPassword(string $password): string {
    return hash('sha256', 'petualangan-admin|' . $password);
}

/* ============================ CSV ============================ */
function parseCSV(string $text): array {
    $rows = [];
    $row = [];
    $field = '';
    $inQ = false;
    $src = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    $len = strlen($src);
    for ($i = 0; $i < $len; $i++) {
        $c = $src[$i];
        if ($inQ) {
            if ($c === '"') {
                if (($src[$i + 1] ?? '') === '"') { $field .= '"'; $i++; }
                else $inQ = false;
            } else $field .= $c;
        } elseif ($c === '"') $inQ = true;
        elseif ($c === ',') { $row[] = $field; $field = ''; }
        elseif ($c === "\n") { $row[] = $field; $rows[] = $row; $row = []; $field = ''; }
        elseif ($c === "\r") { /* lewati */ }
        else $field .= $c;
    }
    if ($field !== '' || $row) { $row[] = $field; $rows[] = $row; }
    return array_values(array_filter($rows, fn($r) => array_filter($r, fn($v) => trim((string)$v) !== '')));
}
function csvCell($v): string {
    $s = (string)($v ?? '');
    return preg_match('/[",\n\r]/', $s) ? '"' . str_replace('"', '""', $s) . '"' : $s;
}
function toCSV(array $rows): string {
    $out = "\xEF\xBB\xBF";
    foreach ($rows as $r) $out .= implode(',', array_map('csvCell', $r)) . "\r\n";
    return $out;
}

/* ==================== Validasi / normalisasi soal ==================== */
function validasiSoal(array $input): array {
    $errs = [];
    $q = [
        'id' => !empty($input['id']) ? (string)$input['id'] : uid('q'),
        'pertanyaan' => trim((string)($input['pertanyaan'] ?? '')),
        'tipe' => ($input['tipe'] ?? '') === 'isian' ? 'isian' : 'pg',
        'opsi' => [],
        'kunci' => $input['kunci'] ?? null,
        'poin' => 10,
        'kategori' => trim((string)($input['kategori'] ?? '')),
        'aktif' => !array_key_exists('aktif', $input) ? true : (bool)$input['aktif'],
        'dibuat' => (string)($input['dibuat'] ?? gmdate('c')),
        'diubah' => gmdate('c'),
    ];
    $poinRaw = $input['poin'] ?? 10;
    $poin = is_numeric($poinRaw) ? (int)round((float)$poinRaw) : 10;
    if ($poin === 0) $poin = 10; // selaras dengan versi Node (Number(x) || 10)
    $q['poin'] = max(0, $poin);

    if (mb_strlen($q['pertanyaan']) < 2) $errs[] = 'Pertanyaan wajib diisi.';

    if ($q['tipe'] === 'pg') {
        $opsi = [];
        foreach ((array)($input['opsi'] ?? []) as $o) {
            $t = trim((string)$o);
            if ($t !== '') $opsi[] = $t;
        }
        $q['opsi'] = array_slice($opsi, 0, 6);
        if (count($q['opsi']) < 2) $errs[] = 'Pilihan ganda butuh minimal 2 opsi jawaban.';
        $k = $input['kunci'] ?? null;
        if (is_string($k)) {
            $kt = trim($k);
            if (preg_match('/^\d+$/', $kt)) {
                $idx = (int)$kt;
                $k = ($idx >= 0 && $idx < count($q['opsi'])) ? $idx : null;
            } else {
                $k = null;
                foreach ($q['opsi'] as $i => $o) if (sama($o, $kt)) { $k = $i; break; }
                // cadangan: kunci berupa huruf opsi A–F (khas tulisan tangan / CSV)
                if ($k === null && preg_match('/^[A-Fa-f]$/', $kt)) {
                    $ord = ord(strtoupper($kt)) - 65;
                    if ($ord >= 0 && $ord < count($q['opsi'])) $k = $ord;
                }
            }
        }
        if (!is_int($k) && !(is_float($k) && (int)$k == $k)) $k = is_numeric($k) ? (int)$k : null;
        if ($k === null || $k < 0 || $k >= count($q['opsi'])) $errs[] = 'Kunci jawaban tidak cocok dengan salah satu opsi.';
        else $q['kunci'] = (int)$k;
    } else {
        $kunci = is_array($input['kunci'] ?? null)
            ? implode('|', array_map('strval', $input['kunci']))
            : trim((string)($input['kunci'] ?? ''));
        $q['kunci'] = $kunci;
        if ($kunci === '') $errs[] = 'Kunci jawaban isian singkat wajib diisi.';
        if (isset($input['opsi']) && is_array($input['opsi'])) {
            $q['opsi'] = array_slice(array_values(array_filter(array_map(fn($o) => trim((string)$o), $input['opsi']), fn($t) => $t !== '')), 0, 6);
        }
    }
    if ($errs) return ['error' => implode(' ', $errs)];
    return ['question' => $q];
}

const CSV_HEADER = ['id', 'pertanyaan', 'tipe', 'opsi1', 'opsi2', 'opsi3', 'opsi4', 'kunci', 'poin', 'kategori', 'aktif'];

function soalKeBarisCSV(array $q): array {
    return [
        $q['id'], $q['pertanyaan'], $q['tipe'],
        $q['opsi'][0] ?? '', $q['opsi'][1] ?? '', $q['opsi'][2] ?? '', $q['opsi'][3] ?? '',
        $q['tipe'] === 'pg' ? ($q['opsi'][$q['kunci']] ?? '') : $q['kunci'],
        $q['poin'], $q['kategori'], !empty($q['aktif']) ? 'ya' : 'tidak',
    ];
}
function barisCSVKeSoal(array $cols, array $peta = []): array {
    // Berbasis nama kolom bila baris judul dikenali (mendukung format tanpa kolom id).
    if ($peta) {
        $ambil = function (array $nama) use ($cols, $peta) {
            foreach ($nama as $n) {
                $i = $peta[strtolower($n)] ?? null;
                if ($i !== null && isset($cols[$i])) return trim((string)$cols[$i]);
            }
            return '';
        };
        $opsi = [];
        foreach ([['opsi1', 'opsiA'], ['opsi2', 'opsiB'], ['opsi3', 'opsiC'], ['opsi4', 'opsiD']] as $slot) {
            $v = $ambil($slot);
            if ($v !== '') $opsi[] = $v;
        }
        $aktif = strtolower($ambil(['aktif']));
        $poinRaw = $ambil(['poin']);
        return [
            'id' => $ambil(['id']) ?: null,
            'pertanyaan' => $ambil(['pertanyaan']),
            'tipe' => strtolower($ambil(['tipe'])) === 'isian' ? 'isian' : 'pg',
            'opsi' => $opsi,
            'kunci' => $ambil(['kunci']),
            'poin' => is_numeric($poinRaw) ? (int)$poinRaw : 10,
            'kategori' => $ambil(['kategori']),
            'aktif' => !in_array($aktif, ['tidak', 'no', 'false', '0', 'nonaktif'], true),
        ];
    }
    // Fallback posisional (format export: id,pertanyaan,tipe,opsi1..4,kunci,poin,kategori,aktif)
    $get = fn(int $i) => trim((string)($cols[$i] ?? ''));
    $opsi = array_values(array_filter([$get(3), $get(4), $get(5), $get(6)], fn($t) => $t !== ''));
    $aktif = strtolower($get(10));
    return [
        'id' => $get(0) ?: null,
        'pertanyaan' => $get(1),
        'tipe' => strtolower($get(2)) === 'isian' ? 'isian' : 'pg',
        'opsi' => $opsi,
        'kunci' => $get(7),
        'poin' => (int)$get(8) ?: 10,
        'kategori' => $get(9),
        'aktif' => !in_array($aktif, ['tidak', 'no', 'false', '0', 'nonaktif'], true),
    ];
}

/* ============================ Auth admin ============================ */
function ambilHeader(string $nama): string {
    $up = strtoupper(str_replace('-', '_', $nama));
    if (isset($_SERVER['HTTP_' . $up])) return (string)$_SERVER['HTTP_' . $up];
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strcasecmp($k, $nama) === 0) return (string)$v;
    }
    return '';
}
function tokenAdmin(): string {
    $h = ambilHeader('Authorization');
    if (preg_match('/^Bearer\s+(.*)$/i', $h, $m)) return trim($m[1]);
    return trim((string)($_GET['tk'] ?? ''));
}
function authAdmin(): bool {
    $token = tokenAdmin();
    if ($token === '') return false;
    $expected = tokenDariPassword((string)config()['adminPassword']);
    return hash_equals($expected, $token);
}
function wajibAuth(): void {
    if (!authAdmin()) gagal(401, 'Token admin tidak valid. Silakan login ulang.');
}

/* ==================== Statistik pemain ==================== */
function hias(array $p): array {
    $total = (int)($p['total'] ?? 0);
    if (($p['status'] ?? '') === 'done') {
        $persen = (int)($p['persen'] ?? 0);
        $detik = (int)($p['detik'] ?? 0);
    } else {
        $persen = $total ? (int)round(((int)($p['benar'] ?? 0) / $total) * 100) : 0;
        $mulai = strtotime((string)($p['mulai'] ?? 'now'));
        $detik = max(0, (int)floor((time() - $mulai)));
    }
    $p['persen'] = $persen;
    $p['detik'] = $detik;
    return $p;
}
function publikSoal(array $q): array {
    return [
        'id' => $q['id'], 'pertanyaan' => $q['pertanyaan'], 'tipe' => $q['tipe'],
        'opsi' => $q['opsi'] ?? [], 'poin' => $q['poin'], 'kategori' => $q['kategori'] ?? '',
    ];
}

/* ============================ Router ============================ */
try {
    siapkanData();

    $metode = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $body = [];
    if ($metode !== 'GET') {
        $raw = (string)file_get_contents('php://input');
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) gagal(400, 'Body JSON tidak valid.');
            $body = $decoded;
        }
        if (isset($body['_method'])) {
            $metode = strtoupper((string)$body['_method']);
            unset($body['_method']);
        }
    }

    $r = trim((string)($_GET['r'] ?? ''), '/');
    $seg = $r === '' ? [] : explode('/', $r);

    /* ---------- Publik: konfigurasi game ---------- */
    if ($seg === ['game', 'config'] && $metode === 'GET') {
        $s = setelan();
        $soal = ($s['packAktif'] ?? true) !== false ? soalAktif() : [];
        ok200([
            'ok' => true,
            'settings' => $s,
            'soal' => array_map('publikSoal', $soal),
            'total' => count($soal),
        ]);
    }

    /* ---------- Publik: sesi pemain ---------- */
    if (($seg[0] ?? '') === 'players') {
        $aktif = soalAktif();
        $totalSoal = count($aktif);

        if (count($seg) === 1 && $metode === 'POST') {
            $nama = trim((string)($body['nama'] ?? ''));
            if (mb_strlen($nama) < 2) gagal(400, 'Nama lengkap wajib diisi (min. 2 karakter).');
            $p = [
                'id' => uid('p'),
                'nama' => mb_substr($nama, 0, 80),
                'kelas' => mb_substr(trim((string)($body['kelas'] ?? '')), 0, 40),
                'nis' => mb_substr(trim((string)($body['nis'] ?? '')), 0, 40),
                'kode_grup' => mb_substr(trim((string)($body['kode_grup'] ?? '')), 0, 40),
                'skor' => 0, 'benar' => 0, 'salah' => 0, 'total' => $totalSoal,
                'persen' => 0, 'detik' => 0,
                'status' => 'playing',
                'mulai' => gmdate('c'), 'selesai' => null,
                'jawaban' => [],
            ];
            $list = daftarPemain();
            $list[] = $p;
            simpanPemain($list);
            kirim(201, ['ok' => true, 'pemain' => hias($p)]);
        }

        if (count($seg) >= 2) {
            $id = $seg[1];
            $p = cariPemain($id);
            if (!$p) gagal(404, 'Sesi permainan tidak ditemukan (mungkin sudah direset admin).');

            if (count($seg) === 2 && $metode === 'GET') ok200(['ok' => true, 'pemain' => hias($p)]);

            if (count($seg) === 2 && $metode === 'DELETE') {
                simpanPemain(array_values(array_filter(daftarPemain(), fn($x) => $x['id'] !== $id)));
                ok200(['ok' => true, 'message' => 'Sesi dihapus. Mulai permainan baru.']);
            }

            if (count($seg) === 3 && $seg[2] === 'answer' && $metode === 'POST') {
                if (($p['status'] ?? '') === 'done') gagal(400, 'Sesi ini sudah selesai. Mulai permainan baru.');
                $qid = (string)($body['questionId'] ?? '');
                $q = null;
                foreach ($aktif as $x) if ($x['id'] === $qid) { $q = $x; break; }
                if (!$q) gagal(404, 'Soal tidak ditemukan atau sudah dinonaktifkan.');
                if (isset($p['jawaban'][$qid])) {
                    $h = hias($p);
                    ok200([
                        'ok' => true, 'sudahDijawab' => true, 'hasil' => $p['jawaban'][$qid],
                        'skor' => $p['skor'], 'benarTotal' => $p['benar'], 'salahTotal' => $p['salah'],
                        'total' => $p['total'], 'persen' => $h['persen'],
                    ]);
                }
                if ($q['tipe'] === 'pg') {
                    $jawab = $body['jawaban'] ?? null;
                    if (is_string($jawab) && preg_match('/^\d+$/', $jawab)) $jawab = (int)$jawab;
                    if (!is_int($jawab) || $jawab < 0 || $jawab >= count($q['opsi'])) gagal(400, 'Pilihan jawaban tidak valid.');
                } else {
                    $jawab = trim((string)($body['jawaban'] ?? ''));
                    if ($jawab === '') gagal(400, 'Jawaban belum diisi.');
                }
                if ($q['tipe'] === 'pg') {
                    $benar = $jawab === (int)$q['kunci'];
                } else {
                    $benar = false;
                    foreach (explode('|', (string)$q['kunci']) as $alt) if (sama($jawab, $alt)) { $benar = true; break; }
                }
                $poin = $benar ? (int)$q['poin'] : 0;
                $rec = ['dijawab' => $jawab, 'benar' => $benar, 'poin' => $poin, 'waktu' => gmdate('c')];

                $list = daftarPemain();
                foreach ($list as &$pl) {
                    if ($pl['id'] !== $id) continue;
                    $pl['jawaban'][$qid] = $rec;
                    $pl['skor'] = (int)$pl['skor'] + $poin;
                    if ($benar) $pl['benar'] = (int)$pl['benar'] + 1; else $pl['salah'] = (int)$pl['salah'] + 1;
                    $pl['total'] = $totalSoal;
                }
                unset($pl);
                simpanPemain($list);
                $updated = cariPemain($id);
                $kunciTeks = $q['tipe'] === 'pg'
                    ? ($q['opsi'][$q['kunci']] ?? '')
                    : explode('|', (string)$q['kunci'])[0];
                ok200([
                    'ok' => true, 'sudahDijawab' => false,
                    'hasil' => [
                        'benar' => $benar, 'poin' => $poin, 'rec' => $rec,
                        'kunci' => $q['kunci'], 'kunciTeks' => $kunciTeks, 'opsi' => $q['opsi'],
                        'skor' => $updated['skor'], 'benarTotal' => $updated['benar'], 'salahTotal' => $updated['salah'],
                        'total' => $totalSoal, 'persen' => hias($updated)['persen'],
                    ],
                ]);
            }

            if (count($seg) === 3 && $seg[2] === 'finish' && $metode === 'POST') {
                $list = daftarPemain();
                foreach ($list as &$pl) {
                    if ($pl['id'] !== $id) continue;
                    $pl['status'] = 'done';
                    $pl['selesai'] = gmdate('c');
                    $pl['total'] = $totalSoal;
                    $pl['persen'] = $totalSoal ? (int)round(((int)$pl['benar'] / $totalSoal) * 100) : 0;
                    $pl['detik'] = max(0, (int)floor((strtotime($pl['selesai']) - strtotime($pl['mulai']))));
                }
                unset($pl);
                simpanPemain($list);
                ok200(['ok' => true, 'pemain' => hias(cariPemain($id))]);
            }
        }
        gagal(404, 'Endpoint tidak ditemukan.');
    }

    /* ---------- Admin ---------- */
    if (($seg[0] ?? '') === 'admin') {
        if ($seg === ['admin', 'login'] && $metode === 'POST') {
            $pass = (string)($body['password'] ?? '');
            $expected = (string)config()['adminPassword'];
            if (!hash_equals($expected, $pass)) gagal(401, 'Password salah.');
            ok200(['ok' => true, 'token' => tokenDariPassword($expected)]);
        }

        wajibAuth();

        /* --- Soal (CRUD) --- */
        if (($seg[1] ?? '') === 'questions') {
            $list = daftarSoal();

            if ($metode === 'GET' && count($seg) === 2) ok200(['ok' => true, 'soal' => $list]);

            if ($metode === 'GET' && ($seg[2] ?? '') === 'export') {
                $format = strtolower((string)($_GET['format'] ?? 'json'));
                if ($format === 'csv') {
                    $rows = [CSV_HEADER];
                    foreach ($list as $q) $rows[] = soalKeBarisCSV($q);
                    ok200(['ok' => true, 'content' => toCSV($rows), 'filename' => 'soal.csv']);
                }
                ok200([
                    'ok' => true,
                    'content' => json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'filename' => 'soal.json',
                ]);
            }

            if ($metode === 'POST' && ($seg[2] ?? '') === 'import') {
                $mode = ($body['mode'] ?? '') === 'merge' ? 'merge' : 'replace';
                $format = ($body['format'] ?? '') === 'csv' ? 'csv' : 'json';
                $items = [];
                try {
                    if ($format === 'csv') {
                        $rows = parseCSV((string)($body['data'] ?? ''));
                        if (!$rows) throw new Exception('CSV kosong');
                        $header = array_map(fn($h) => strtolower(trim((string)$h)), array_shift($rows));
                        $peta = [];
                        foreach ($header as $i => $h) if ($h !== '') $peta[$h] = $i;
                        if (isset($peta['pertanyaan'])) {
                            foreach ($rows as $cols) $items[] = barisCSVKeSoal($cols, $peta);
                        } else {
                            // fallback lama: baris pertama = judul, kolom posisional
                            foreach ($rows as $cols) $items[] = barisCSVKeSoal($cols);
                        }
                    } else {
                        $parsed = json_decode((string)($body['data'] ?? '[]'), true);
                        if (!is_array($parsed)) throw new Exception('JSON tidak valid');
                        if (isset($parsed['soal']) && is_array($parsed['soal'])) $items = $parsed['soal'];
                        elseif (array_is_list($parsed)) $items = $parsed;
                        elseif (isset($parsed['pertanyaan'])) $items = [$parsed]; // satu objek soal
                        else throw new Exception('Struktur JSON tidak dikenali (harus array soal).');
                    }
                } catch (Throwable $e) {
                    gagal(400, 'Gagal memparsing data: ' . $e->getMessage());
                }
                if (!is_array($items) || !$items) gagal(400, 'Tidak ada data soal di dalam file.');

                $errors = [];
                $hasil = [];
                $i = 0;
                foreach ($items as $it) {
                    $i++;
                    if (!is_array($it)) { $errors[] = "Baris $i: data bukan objek soal."; continue; }
                    $v = validasiSoal($it);
                    if (isset($v['error'])) $errors[] = "Baris $i: {$v['error']}";
                    else $hasil[] = $v['question'];
                }

                if ($mode === 'replace') {
                    simpanSoal($hasil);
                    ok200(['ok' => true, 'ditambah' => count($hasil), 'diperbarui' => 0, 'errors' => $errors, 'total' => count($hasil)]);
                }
                $current = daftarSoal();
                $added = 0;
                $updated = 0;
                foreach ($hasil as $q) {
                    $idx = -1;
                    foreach ($current as $j => $x) {
                        if (($x['id'] ?? '') === $q['id'] || ($x['pertanyaan'] ?? '') === $q['pertanyaan']) { $idx = $j; break; }
                    }
                    if ($idx >= 0) {
                        $q['id'] = $current[$idx]['id'];
                        $q['dibuat'] = $current[$idx]['dibuat'];
                        $current[$idx] = $q;
                        $updated++;
                    } else {
                        $current[] = $q;
                        $added++;
                    }
                }
                simpanSoal($current);
                ok200(['ok' => true, 'ditambah' => $added, 'diperbarui' => $updated, 'errors' => $errors, 'total' => count($current)]);
            }

            if ($metode === 'POST' && count($seg) === 2) {
                $v = validasiSoal($body);
                if (isset($v['error'])) gagal(400, $v['error']);
                $list[] = $v['question'];
                simpanSoal($list);
                kirim(201, ['ok' => true, 'soal' => $v['question']]);
            }

            if (count($seg) === 3 && $metode === 'DELETE') {
                $idx = -1;
                foreach ($list as $i => $q) if (($q['id'] ?? '') === $seg[2]) { $idx = $i; break; }
                if ($idx === -1) gagal(404, 'Soal tidak ditemukan.');
                array_splice($list, $idx, 1);
                simpanSoal($list);
                ok200(['ok' => true, 'message' => 'Soal dihapus.']);
            }

            if (count($seg) === 3 && $metode === 'PUT') {
                $idx = -1;
                foreach ($list as $i => $q) if (($q['id'] ?? '') === $seg[2]) { $idx = $i; break; }
                if ($idx === -1) gagal(404, 'Soal tidak ditemukan.');
                $merged = array_merge($list[$idx], $body);
                $merged['id'] = $list[$idx]['id'];
                $merged['dibuat'] = $list[$idx]['dibuat'];
                $v = validasiSoal($merged);
                if (isset($v['error'])) gagal(400, $v['error']);
                $list[$idx] = $v['question'];
                simpanSoal($list);
                ok200(['ok' => true, 'soal' => $v['question']]);
            }
        }

        /* --- Pengaturan + ganti password --- */
        if ($seg === ['admin', 'settings']) {
            if ($metode === 'GET') ok200(['ok' => true, 'settings' => setelan()]);
            if ($metode === 'PUT') {
                $patch = [];
                if (array_key_exists('acakPosisi', $body)) $patch['acakPosisi'] = (bool)$body['acakPosisi'];
                if (array_key_exists('packAktif', $body)) $patch['packAktif'] = (bool)$body['packAktif'];
                $s = simpanSetelan($patch);
                $token = null;
                if (isset($body['password']) && is_string($body['password']) && strlen($body['password']) >= 6) {
                    simpanConfig(['adminPassword' => $body['password']]);
                    $token = tokenDariPassword($body['password']);
                }
                ok200([
                    'ok' => true, 'settings' => $s, 'token' => $token,
                    'message' => $token ? 'Password diperbarui.' : 'Pengaturan disimpan.',
                ]);
            }
        }

        /* --- Daftar nilai --- */
        if (($seg[1] ?? '') === 'scores') {
            if ($metode === 'GET' && count($seg) === 2) {
                $players = array_map('hias', daftarPemain());
                usort($players, function ($a, $b) {
                    return ($b['skor'] <=> $a['skor']) ?: (strtotime($b['mulai']) <=> strtotime($a['mulai']));
                });
                ok200(['ok' => true, 'nilai' => $players]);
            }
            if ($metode === 'DELETE' && count($seg) === 2) {
                $n = count(daftarPemain());
                simpanPemain([]);
                ok200(['ok' => true, 'message' => "$n data nilai direset."]);
            }
            if ($metode === 'DELETE' && count($seg) === 3) {
                $before = count(daftarPemain());
                simpanPemain(array_values(array_filter(daftarPemain(), fn($p) => $p['id'] !== $seg[2])));
                ok200(['ok' => true, 'message' => $before === count(daftarPemain()) ? 'Data tidak ditemukan.' : 'Data nilai dihapus.']);
            }
        }

        gagal(404, 'Endpoint admin tidak ditemukan.');
    }

    gagal(404, 'Endpoint tidak ditemukan.');
} catch (Throwable $e) {
    gagal(500, 'Terjadi kesalahan server: ' . $e->getMessage());
}
