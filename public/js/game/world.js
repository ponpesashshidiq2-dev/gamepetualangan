/**
 * world.js — Membangun dunia 3D low-poly (pulau + labirin semak + objek soal).
 * Semua elemen dibuat prosedural dari primitif Three.js (tanpa file aset).
 */
import * as THREE from 'three';
import { acakSeeded } from '../api.js';

const ISLAND_R = 62;
const MAZE_N = 9;           // labirin 9x9 sel
const CELL = 6.4;
const WALL_T = 0.7;
const WALL_H = 2.6;
const HALF = (MAZE_N * CELL) / 2;   // 28.8
const BATAS_MAIN = 57;              // batas gerak pemain

/* ---------- tekstur prosedural ---------- */
function teksGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function teksLabel(teks) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(4,16,12,.72)';
  const r = 26, w = c.width, h = c.height;
  g.beginPath();
  g.moveTo(r, 4); g.lineTo(w - r, 4); g.quadraticCurveTo(w - 4, 4, w - 4, r);
  g.lineTo(w - 4, h - r); g.quadraticCurveTo(w - 4, h - 4, w - r, h - 4);
  g.lineTo(r, h - 4); g.quadraticCurveTo(4, h - 4, 4, h - r);
  g.lineTo(4, r); g.quadraticCurveTo(4, 4, r, 4); g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,201,77,.85)'; g.lineWidth = 4; g.stroke();
  g.fillStyle = '#fff4d6';
  g.font = 'bold 52px "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(teks, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/* ---------- generator labirin (recursive backtracker) ---------- */
function buatLabirin(rnd) {
  const N = MAZE_N;
  // wallsH[r][c] = dinding horizontal di garis z=r (menutup sel c di baris r-1 / r)
  const wallsH = Array.from({ length: N + 1 }, () => Array(N).fill(true));
  // wallsV[r][c] = dinding vertikal di garis x=c (menutup sel r-1 / r di kolom c)
  const wallsV = Array.from({ length: N }, () => Array(N + 1).fill(true));
  const kunjung = Array.from({ length: N }, () => Array(N).fill(false));
  const tumpukan = [[0, 0]];
  kunjung[0][0] = true;
  const arah = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  while (tumpukan.length) {
    const [x, y] = tumpukan[tumpukan.length - 1];
    const tetangga = [];
    for (const [dx, dy] of arah) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N && !kunjung[nx][ny]) tetangga.push([nx, ny, dx, dy]);
    }
    if (!tetangga.length) { tumpukan.pop(); continue; }
    const [nx, ny, dx, dy] = tetangga[Math.floor(rnd() * tetangga.length)];
    // konvensi: wallsV[baris][kolom], wallsH[baris][kolom]
    if (dx === 1) wallsV[y][x + 1] = false;
    else if (dx === -1) wallsV[y][x] = false;
    else if (dy === 1) wallsH[y + 1][x] = false;
    else wallsH[y][x] = false;
    kunjung[nx][ny] = true;
    tumpukan.push([nx, ny]);
  }
  const mid = Math.floor(N / 2);
  wallsH[0][mid] = false; wallsH[N][mid] = false;   // pintu utara & selatan
  wallsV[mid][0] = false; wallsV[mid][N] = false;   // pintu barat & timur
  return { wallsH, wallsV };
}

/* ============================================================ */
export function buatDunia(scene) {
  const rnd = acakSeeded(20261119);
  const colliders = [];        // {x,z,hx,hz}  untuk gerakan pemain
  const blockKamera = [];      // {x,z,hx,hz,y0,y1} untuk raycast kamera

  scene.background = new THREE.Color(0x9fd4f5);
  scene.fog = new THREE.Fog(0x9fd4f5, 70, 190);

  /* --- pencahayaan --- */
  const hemi = new THREE.HemisphereLight(0xcfeaff, 0x4c7a3f, 0.85);
  scene.add(hemi);
  const matahari = new THREE.DirectionalLight(0xfff2d4, 1.45);
  matahari.position.set(70, 110, 45);
  matahari.castShadow = true;
  matahari.shadow.mapSize.set(2048, 2048);
  matahari.shadow.camera.left = -85; matahari.shadow.camera.right = 85;
  matahari.shadow.camera.top = 85; matahari.shadow.camera.bottom = -85;
  matahari.shadow.camera.near = 20; matahari.shadow.camera.far = 260;
  matahari.shadow.bias = -0.0006;
  scene.add(matahari);

  /* --- pulau & laut --- */
  const tanah = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_R, 72),
    new THREE.MeshStandardMaterial({ color: 0x5da455, roughness: 1, flatShading: true })
  );
  tanah.rotation.x = -Math.PI / 2;
  tanah.receiveShadow = true;
  scene.add(tanah);

  const pasir = new THREE.Mesh(
    new THREE.RingGeometry(ISLAND_R, ISLAND_R + 5, 72),
    new THREE.MeshStandardMaterial({ color: 0xE7D8A9, roughness: 1 })
  );
  pasir.rotation.x = -Math.PI / 2;
  pasir.position.y = -0.25;
  scene.add(pasir);

  const laut = new THREE.Mesh(
    new THREE.CircleGeometry(320, 64),
    new THREE.MeshStandardMaterial({ color: 0x2f6db5, roughness: 0.55, metalness: 0.1 })
  );
  laut.rotation.x = -Math.PI / 2;
  laut.position.y = -1.1;
  scene.add(laut);

  // bercak rumput agar tanah tidak polos
  const bercakGeo = new THREE.CircleGeometry(1, 8);
  const bercakMat = new THREE.MeshStandardMaterial({ color: 0x6ab162, roughness: 1 });
  const bercak = new THREE.InstancedMesh(bercakGeo, bercakMat, 26);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  qt.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 8 + rnd() * (ISLAND_R - 14);
    pos.set(Math.cos(a) * r, 0.02, Math.sin(a) * r);
    const s = 2 + rnd() * 4; sc.set(s, s, s);
    m4.compose(pos, qt, sc);
    bercak.setMatrixAt(i, m4);
  }
  bercak.receiveShadow = true;
  scene.add(bercak);

  /* --- LABIRIN --- */
  const { wallsH, wallsV } = buatLabirin(rnd);
  const segmen = [];
  const minX = -HALF, minZ = -HALF;
  for (let r = 0; r <= MAZE_N; r++) {
    for (let c = 0; c < MAZE_N; c++) {
      if (!wallsH[r][c]) continue;
      segmen.push({ x: minX + (c + 0.5) * CELL, z: minZ + r * CELL, sx: CELL + WALL_T, sz: WALL_T });
    }
  }
  for (let r = 0; r < MAZE_N; r++) {
    for (let c = 0; c <= MAZE_N; c++) {
      if (!wallsV[r][c]) continue;
      segmen.push({ x: minX + c * CELL, z: minZ + (r + 0.5) * CELL, sx: WALL_T, sz: CELL + WALL_T });
    }
  }
  const dindingGeo = new THREE.BoxGeometry(1, 1, 1);
  const dindingMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3f, roughness: 1, flatShading: true });
  const dinding = new THREE.InstancedMesh(dindingGeo, dindingMat, segmen.length);
  segmen.forEach((s, i) => {
    m4.compose(
      new THREE.Vector3(s.x, WALL_H / 2, s.z),
      new THREE.Quaternion(),
      new THREE.Vector3(s.sx, WALL_H, s.sz)
    );
    dinding.setMatrixAt(i, m4);
    colliders.push({ x: s.x, z: s.z, hx: s.sx / 2, hz: s.sz / 2 });
    blockKamera.push({ x: s.x, z: s.z, hx: s.sx / 2, hz: s.sz / 2, y0: 0, y1: WALL_H });
  });
  dinding.castShadow = true;
  dinding.receiveShadow = true;
  scene.add(dinding);

  /* --- menara mercusuar (penanda arah) --- */
  const menara = new THREE.Group();
  const MENARA_POS = new THREE.Vector3(42, 0, -34);
  const badanMat = new THREE.MeshStandardMaterial({ color: 0xf3f1e6, roughness: .9, flatShading: true });
  const badan = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.1, 12, 10), badanMat);
  badan.position.y = 6;
  const pita = new THREE.Mesh(new THREE.CylinderGeometry(2.62, 2.68, 2.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: .9, flatShading: true }));
  pita.position.y = 7.6;
  const puncak = new THREE.Mesh(new THREE.ConeGeometry(3.1, 3, 10),
    new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: .8, flatShading: true }));
  puncak.position.y = 13.5;
  const lampu = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc94d, emissiveIntensity: 1.6 }));
  lampu.position.y = 12.2;
  [badan, pita, puncak, lampu].forEach((m) => { m.castShadow = true; menara.add(m); });
  menara.position.copy(MENARA_POS);
  scene.add(menara);
  colliders.push({ x: MENARA_POS.x, z: MENARA_POS.z, hx: 3.4, hz: 3.4 });
  blockKamera.push({ x: MENARA_POS.x, z: MENARA_POS.z, hx: 3.4, hz: 3.4, y0: 0, y1: 15 });

  /* --- bantuan: apakah titik bebas dari halangan --- */
  function bebas(x, z, margin, lewatiLabirin = false) {
    if (Math.hypot(x, z) > BATAS_MAIN - 1) return false;
    const diLabirin = Math.abs(x) < HALF + 1 && Math.abs(z) < HALF + 1;
    if (lewatiLabirin && diLabirin) return true;
    for (const c of colliders) {
      const dx = Math.max(Math.abs(x - c.x) - c.hx, 0);
      const dz = Math.max(Math.abs(z - c.z) - c.hz, 0);
      if (Math.hypot(dx, dz) < margin) return false;
    }
    return true;
  }

  /* --- pohon (instanced) --- */
  const TOTAL_POHON = 64;
  const batangGeo = new THREE.CylinderGeometry(0.32, 0.48, 2.6, 6);
  batangGeo.translate(0, 1.3, 0);
  const daunKerucutGeo = new THREE.ConeGeometry(2.3, 5.2, 8);
  daunKerucutGeo.translate(0, 4.6, 0);
  const daunBulatGeo = new THREE.IcosahedronGeometry(2.5, 0);
  daunBulatGeo.translate(0, 4.1, 0);

  const batangMesh = new THREE.InstancedMesh(batangGeo,
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1, flatShading: true }), TOTAL_POHON);
  const kerucutMesh = new THREE.InstancedMesh(daunKerucutGeo,
    new THREE.MeshStandardMaterial({ color: 0x2f8b52, roughness: 1, flatShading: true }), TOTAL_POHON);
  const bulatMesh = new THREE.InstancedMesh(daunBulatGeo,
    new THREE.MeshStandardMaterial({ color: 0x3fa34d, roughness: 1, flatShading: true }), TOTAL_POHON);
  let nKerucut = 0, nBulat = 0;
  const warna = new THREE.Color();

  for (let i = 0, percobaan = 0; i < TOTAL_POHON && percobaan < 3000; percobaan++) {
    const a = rnd() * Math.PI * 2;
    const r = 33 + rnd() * (ISLAND_R - 39);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - 0, z - 36) < 8) continue;          // jalur spawn pemain
    if (!bebas(x, z, 2.6)) continue;
    const s = 0.75 + rnd() * 0.7;
    const putar = rnd() * Math.PI * 2;
    m4.compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, putar, 0)),
      new THREE.Vector3(s, s * (0.85 + rnd() * 0.4), s));
    batangMesh.setMatrixAt(i, m4);
    if (rnd() < 0.68) {
      kerucutMesh.setMatrixAt(nKerucut, m4);
      warna.setHSL(0.33 + rnd() * 0.05, 0.5, 0.32 + rnd() * 0.12);
      kerucutMesh.setColorAt(nKerucut, warna);
      nKerucut++;
    } else {
      bulatMesh.setMatrixAt(nBulat, m4);
      warna.setHSL(0.28 + rnd() * 0.07, 0.52, 0.36 + rnd() * 0.12);
      bulatMesh.setColorAt(nBulat, warna);
      nBulat++;
    }
    colliders.push({ x, z, hx: 0.55 * s, hz: 0.55 * s });
    blockKamera.push({ x, z, hx: 1.6 * s, hz: 1.6 * s, y0: 0, y1: 6.5 * s });
    i++;
  }
  kerucutMesh.count = nKerucut;
  bulatMesh.count = nBulat;
  [batangMesh, kerucutMesh, bulatMesh].forEach((m) => {
    m.castShadow = true; m.receiveShadow = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
  });

  /* --- batu --- */
  const TOTAL_BATU = 26;
  const batuMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 1, flatShading: true }),
    TOTAL_BATU
  );
  let nBatu = 0;
  for (let percobaan = 0; percobaan < 2000 && nBatu < TOTAL_BATU; percobaan++) {
    const a = rnd() * Math.PI * 2;
    const r = 33 + rnd() * (ISLAND_R - 40);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z - 36) < 8) continue;
    const s = 0.7 + rnd() * 1.5;
    if (!bebas(x, z, s + 1.4)) continue;
    m4.compose(new THREE.Vector3(x, s * 0.42, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd() * 6.28, rnd())),
      new THREE.Vector3(s, s * (0.7 + rnd() * 0.5), s));
    batuMesh.setMatrixAt(nBatu, m4);
    warna.setHSL(0.58, 0.05, 0.48 + rnd() * 0.18);
    batuMesh.setColorAt(nBatu, warna);
    colliders.push({ x, z, hx: s * 0.85, hz: s * 0.85 });
    if (s > 1.1) blockKamera.push({ x, z, hx: s * 0.9, hz: s * 0.9, y0: 0, y1: s * 1.4 });
    nBatu++;
  }
  batuMesh.count = nBatu;
  batuMesh.castShadow = true; batuMesh.receiveShadow = true;
  if (batuMesh.instanceColor) batuMesh.instanceColor.needsUpdate = true;
  scene.add(batuMesh);

  /* --- awan --- */
  const awanMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: .92, flatShading: true });
  const awan = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 3 + Math.floor(rnd() * 3); j++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 + rnd() * 2.4, 0), awanMat);
      b.position.set(j * 3.4 - 4, rnd() * 1.6, rnd() * 2.5);
      g.add(b);
    }
    g.position.set(-130 + rnd() * 260, 44 + rnd() * 16, -110 + rnd() * 220);
    scene.add(g);
    awan.push({ obj: g, kecepatan: 0.6 + rnd() * 1.1 });
  }

  /* --- KANDIDAT POSISI SOAL --- */
  const kandidat = [];
  function tambahKandidat(x, z) {
    if (!bebas(x, z, 2.4)) return;
    for (const k of kandidat) if (Math.hypot(k.x - x, k.z - z) < 4.5) return;
    kandidat.push({ x, z });
  }
  // 1) pusat setiap sel labirin (pastikan di koridor)
  for (let r = 0; r < MAZE_N; r++)
    for (let c = 0; c < MAZE_N; c++)
      tambahKandidat(minX + (c + 0.5) * CELL, minZ + (r + 0.5) * CELL);
  // 2) taman di luar labirin
  for (let i = 0; i < 260 && kandidat.length < 190; i++) {
    const a = rnd() * Math.PI * 2, r = 33 + rnd() * (ISLAND_R - 40);
    tambahKandidat(Math.cos(a) * r, Math.sin(a) * r);
  }
  // 3) cadangan bebas (jika soal sangat banyak)
  let jaga = 0;
  while (kandidat.length < 240 && jaga++ < 4000) {
    const a = rnd() * Math.PI * 2, r = 4 + rnd() * (ISLAND_R - 10);
    tambahKandidat(Math.cos(a) * r, Math.sin(a) * r);
  }

  /* --- objek soal (kristal) --- */
  const TEX_GLOW = teksGlow();
  const objekSoal = new Map();   // qid -> data
  const posisiSoal = new Map();  // qid -> {x,z}
  let urutanKandidat = [];

  function spawnSoal(listSoal, seed) {
    // bersihkan kristal lama
    objekSoal.forEach((o) => { scene.remove(o.grup); disposeObj(o.grup); });
    objekSoal.clear(); posisiSoal.clear();

    const r2 = acakSeeded(seed);
    const pool = kandidat.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r2() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    urutanKandidat = pool;
    const hasil = [];

    listSoal.forEach((soal, idx) => {
      const titik = pool[idx % pool.length];
      const offset = idx >= pool.length ? { x: (r2() - .5) * 2, z: (r2() - .5) * 2 } : { x: 0, z: 0 };
      const x = titik.x + offset.x, z = titik.z + offset.z;
      const grup = new THREE.Group();

      const intiMat = new THREE.MeshStandardMaterial({
        color: 0xffc94d, emissive: 0xffa000, emissiveIntensity: 1.15,
        roughness: .25, metalness: .15, flatShading: true,
      });
      const inti = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), intiMat);
      inti.castShadow = true;
      grup.add(inti);

      const cincin = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.07, 6, 26),
        new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xffc94d, emissiveIntensity: 1.2, roughness: .4 })
      );
      cincin.rotation.x = Math.PI / 2;
      grup.add(cincin);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX_GLOW, color: 0xffc94d, transparent: true, opacity: .75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(5.6, 5.6, 1);
      grup.add(glow);

      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: teksLabel('Soal ' + (idx + 1)), transparent: true, depthWrite: false,
      }));
      label.scale.set(2.6, 1.14, 1);
      label.position.y = 2.1;
      grup.add(label);

      grup.position.set(x, 1.5, z);
      scene.add(grup);

      const data = { grup, inti, cincin, glow, label, fase: r2() * 6.28, dasarY: 1.5, soal, x, z, dijawab: false };
      objekSoal.set(soal.id, data);
      posisiSoal.set(soal.id, { x, z });
      hasil.push({ id: soal.id, x, z });
    });
    return hasil;
  }

  function tandaiDijawab(qid) {
    const o = objekSoal.get(qid);
    if (!o || o.dijawab) return;
    o.dijawab = true;
    o.inti.material.color.set(0x48d9a0);
    o.inti.material.emissive.set(0x1fa877);
    o.inti.material.emissiveIntensity = .75;
    o.cincin.material.color.set(0xd8fff0);
    o.cincin.material.emissive.set(0x48d9a0);
    o.glow.material.color.set(0x48d9a0);
    o.glow.material.opacity = .3;
    o.label.material.opacity = .55;
  }

  function disposeObj(root) {
    root.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) {
        if (n.material.map && n.material.map !== TEX_GLOW) n.material.map.dispose();
        n.material.dispose();
      }
    });
  }

  /* --- animasi --- */
  function update(waktu, dt) {
    laut.position.y = -1.1 + Math.sin(waktu * 0.7) * 0.12;
    pasir.position.y = -0.25 + Math.sin(waktu * 0.7) * 0.06;
    objekSoal.forEach((o) => {
      const putaran = o.dijawab ? 0.5 : 1.4;
      o.inti.rotation.y += dt * putaran;
      o.inti.rotation.x += dt * putaran * 0.4;
      o.cincin.rotation.z += dt * (o.dijawab ? 0.4 : 1.1);
      const amplitudo = o.dijawab ? 0.08 : 0.26;
      o.grup.position.y = o.dasarY + Math.sin(waktu * 2 + o.fase) * amplitudo;
      if (!o.dijawab) {
        const denyut = 5.6 + Math.sin(waktu * 3 + o.fase) * 0.7;
        o.glow.scale.set(denyut, denyut, 1);
      }
      o.label.position.y = 2.1 + Math.sin(waktu * 2 + o.fase) * 0.08;
    });
    for (const a of awan) {
      a.obj.position.x += a.kecepatan * dt;
      if (a.obj.position.x > 145) a.obj.position.x = -145;
    }
  }

  return {
    colliders, blockKamera, batas: BATAS_MAIN,
    titikSpawnPemain: new THREE.Vector3(0, 0, 36),
    posisiSoal, objekSoal,
    spawnSoal, tandaiDijawab, update,
    daftarKandidat: () => urutanKandidat,
  };
}
