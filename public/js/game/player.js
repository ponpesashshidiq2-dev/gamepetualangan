/**
 * player.js — Karakter hero, kontrol (keyboard/pointer lock/touch),
 * fisika lompat, collision sederhana, dan kamera orang-ketiga.
 */
import * as THREE from 'three';

const TINGGI_KEPALA = 1.7;
const JARAK_KAMERA = 6.4;
const KECEPATAN = 9.5;
const GRAVITASI = -24;

/* ---------------- model hero low-poly ---------------- */
function buatHero() {
  const hero = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: .95, flatShading: true });

  function limb(w, h, d, warna, y, x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(warna));
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    hero.add(pivot);
    return pivot;
  }

  const kakiKiri = limb(0.26, 0.8, 0.3, 0x2b4a7a, 0.8, -0.17);
  const kakiKanan = limb(0.26, 0.8, 0.3, 0x2b4a7a, 0.8, 0.17);
  const tanganKiri = limb(0.2, 0.72, 0.24, 0xefc08d, 1.5, -0.5);
  const tanganKanan = limb(0.2, 0.72, 0.24, 0xefc08d, 1.5, 0.5);

  const badan = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.82, 0.44), mat(0x2fa87c));
  badan.position.y = 1.21; badan.castShadow = true;
  hero.add(badan);

  const sabuk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.46), mat(0x7a4b23));
  sabuk.position.y = 0.86;
  hero.add(sabuk);

  const kepala = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.52), mat(0xefc08d));
  kepala.position.y = 1.9; kepala.castShadow = true;
  hero.add(kepala);

  const rambut = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.56), mat(0x33261b));
  rambut.position.y = 2.2;
  hero.add(rambut);

  const topi = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.16, 0.64), mat(0xd94f4f));
  topi.position.y = 2.32;
  hero.add(topi);
  const topiDepan = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.3), mat(0xd94f4f));
  topiDepan.position.set(0, 2.26, 0.44);
  hero.add(topiDepan);

  const mataGeo = new THREE.BoxGeometry(0.08, 0.1, 0.04);
  const mataMat = mat(0x1b1b1b);
  [-0.13, 0.13].forEach((x) => {
    const m = new THREE.Mesh(mataGeo, mataMat);
    m.position.set(x, 1.94, 0.27);
    hero.add(m);
  });

  return { hero, kakiKiri, kakiKanan, tanganKiri, tanganKanan, badan };
}

/* ---------------- ray vs AABB (3D slab) ---------------- */
function rayAABB(o, d, b) {
  let tmin = 0, tmax = 1;
  const sumbu = [
    [o.x, d.x, b.x - b.hx, b.x + b.hx],
    [o.y, d.y, b.y0, b.y1],
    [o.z, d.z, b.z - b.hz, b.z + b.hz],
  ];
  for (const [or, dr, mn, mx] of sumbu) {
    if (Math.abs(dr) < 1e-9) { if (or < mn || or > mx) return null; }
    else {
      let t1 = (mn - or) / dr, t2 = (mx - or) / dr;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/* ============================================================ */
export class Pemain {
  constructor({ scene, world, camera, canvas, sentuh }) {
    this.world = world;
    this.camera = camera;
    this.canvas = canvas;
    this.pos = world.titikSpawnPemain.clone();
    this.vy = 0;
    this.diTanah = true;
    this.kamYaw = 0;         // 0 => kamera di belakang (arah -Z)
    this.kamPitch = 0.34;    // >0 => kamera tinggi, menunduk
    this.aktif = true;
    this.onInteract = null;

    const model = buatHero();
    this.hero = model.hero;
    Object.assign(this, model);
    this.hero.position.copy(this.pos);
    scene.add(this.hero);

    this.keys = new Set();
    this.joy = new THREE.Vector2(0, 0);   // joystick: x kanan, y maju
    this.arahHadap = 0;
    this.locked = false;
    this._pointerLook = null;
    this._sentuhAktif = !!sentuh;

    this._pasangKeyboard();
    this._pasangPointer();
    this._pasangSentuh();
  }

  /* ---------------- input ---------------- */
  _pasangKeyboard() {
    this._kd = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === ' ' && this.aktif) this._lompat();
      if (k === 'e' && this.aktif && this.onInteract) this.onInteract();
    };
    this._ku = (e) => this.keys.delete(e.key.toLowerCase());
    this._blur = () => this.keys.clear();
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
  }

  _pasangPointer() {
    const el = this.canvas;
    el.addEventListener('click', () => {
      if (!this.aktif || this._sentuhAktif || this.locked) return;
      if (this._pernahDrag) { this._pernahDrag = false; return; }
      this.mintaKunci();
    });
    el.addEventListener('pointerdown', (e) => {
      if (!this.aktif) return;
      this._pointerLook = { id: e.pointerId, x: e.clientX, y: e.clientY, gerak: 0, mouse: e.pointerType === 'mouse' };
    });
    el.addEventListener('pointermove', (e) => {
      const st = this._pointerLook;
      if (!st || st.id !== e.pointerId) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      st.x = e.clientX; st.y = e.clientY;
      st.gerak += Math.abs(dx) + Math.abs(dy);
      if (st.gerak > 5) {
        this._putarKamera(dx, dy);
        if (st.mouse) this._pernahDrag = true;
      }
    });
    const selesai = (e) => {
      const st = this._pointerLook;
      if (st && st.id === e.pointerId) this._pointerLook = null;
      if (st && st.gerak <= 5 && st.mouse) {
        // klik pendek tanpa drag -> kunci kursor (sudah ditangani event click)
      }
    };
    el.addEventListener('pointerup', selesai);
    el.addEventListener('pointercancel', selesai);

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.aktif) return;
      this._putarKamera(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (typeof this.onLockChange === 'function') this.onLockChange(this.locked);
    });
  }

  _pasangSentuh() {
    const joystick = document.getElementById('joystick');
    const knop = document.getElementById('joystick-knop');
    const btnLompat = document.getElementById('btn-mobile-jump');
    const btnAksi = document.getElementById('btn-mobile-act');
    if (!joystick) return;

    let idJoy = null;
    const pusat = () => {
      const r = joystick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: r.width / 2 };
    };
    joystick.addEventListener('pointerdown', (e) => {
      idJoy = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    joystick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== idJoy) return;
      const c = pusat();
      let dx = (e.clientX - c.x) / (c.radius * 0.75);
      let dy = (e.clientY - c.y) / (c.radius * 0.75);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.joy.set(dx, -dy);
      knop.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    });
    const lepas = (e) => {
      if (e.pointerId !== idJoy) return;
      idJoy = null;
      this.joy.set(0, 0);
      knop.style.transform = 'translate(0,0)';
    };
    joystick.addEventListener('pointerup', lepas);
    joystick.addEventListener('pointercancel', lepas);

    if (btnLompat) {
      btnLompat.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.aktif) this._lompat(); });
    }
    if (btnAksi) {
      btnAksi.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.aktif && this.onInteract) this.onInteract();
      });
    }
  }

  _putarKamera(dx, dy) {
    if (!this.aktif) return;
    this.kamYaw -= dx * 0.0035;
    this.kamPitch = Math.max(-0.35, Math.min(1.15, this.kamPitch + dy * 0.003));
  }

  mintaKunci() {
    if (this._sentuhAktif) return;
    const el = this.canvas;
    if (document.pointerLockElement === el) return;
    const p = el.requestPointerLock && el.requestPointerLock();
    if (p && p.catch) p.catch(() => { /* ditolak browser — fallback drag */ });
  }
  lepasKunci() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setAktif(v) {
    this.aktif = v;
    if (!v) { this.keys.clear(); this.joy.set(0, 0); const k = document.getElementById('joystick-knop'); if (k) k.style.transform = 'translate(0,0)'; }
  }

  _lompat() {
    if (!this.diTanah) return;
    this.vy = 8.6;
    this.diTanah = false;
  }

  teleport(x, z) {
    this.pos.set(x, 0, z);
    this.vy = 0;
    this.hero.position.copy(this.pos);
  }

  /* ---------------- collision ---------------- */
  _selesaikan(x, z, r) {
    const cols = this.world.colliders;
    for (let pass = 0; pass < 2; pass++) {
      for (const c of cols) {
        const dx = x - c.x, dz = z - c.z;
        const ox = Math.max(-c.hx, Math.min(c.hx, dx));
        const oz = Math.max(-c.hz, Math.min(c.hz, dz));
        if (dx === ox && dz === oz) {
          // berada di dalam kotak -> dorong ke sisi terdekat
          const sisaX = c.hx - Math.abs(dx), sisaZ = c.hz - Math.abs(dz);
          if (sisaX < sisaZ) x += (dx >= 0 ? 1 : -1) * (sisaX + r);
          else z += (dz >= 0 ? 1 : -1) * (sisaZ + r);
        } else {
          const d = Math.hypot(dx - ox, dz - oz);
          if (d < r && d > 1e-6) {
            const dorong = (r - d) / d;
            x += (dx - ox) * dorong;
            z += (dz - oz) * dorong;
          }
        }
      }
    }
    const batas = this.world.batas;
    const jarak = Math.hypot(x, z);
    if (jarak > batas) { x *= batas / jarak; z *= batas / jarak; }
    return { x, z };
  }

  /* ---------------- update tiap frame ---------------- */
  update(dt) {
    const waktu = performance.now() / 1000;
    let vx = 0, vz = 0;

    if (this.aktif) {
      let ix = 0, iy = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) iy += 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) iy -= 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) ix -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) ix += 1;
      ix += this.joy.x; iy += this.joy.y;

      const panjang = Math.hypot(ix, iy);
      if (panjang > 1e-3) {
        const n = Math.min(1, panjang);
        ix = (ix / panjang) * n;
        iy = (iy / panjang) * n;
        // arah hadap kamera (yaw=0 -> tampak ke -Z)
        const fx = -Math.sin(this.kamYaw), fz = -Math.cos(this.kamYaw);
        const rx = -fz, rz = fx;
        vx = (fx * iy + rx * ix) * KECEPATAN;
        vz = (fz * iy + rz * ix) * KECEPATAN;
      }
    }

    // fisika vertikal
    this.vy += GRAVITASI * dt;
    let y = this.pos.y + this.vy * dt;
    if (y <= 0) { y = 0; this.vy = 0; this.diTanah = true; }

    // gerak horizontal + collision
    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;
    const res = this._selesaikan(nx, nz, 0.5);
    this.pos.set(res.x, y, res.z);
    this.hero.position.copy(this.pos);

    // animasi hero
    const kecepatan = Math.hypot(vx, vz);
    if (kecepatan > 0.5) {
      this.arahHadap = Math.atan2(vx, vz);
      let beda = this.arahHadap - this.hero.rotation.y;
      while (beda > Math.PI) beda -= Math.PI * 2;
      while (beda < -Math.PI) beda += Math.PI * 2;
      this.hero.rotation.y += beda * Math.min(1, dt * 12);
    }
    const ayun = Math.min(1, kecepatan / KECEPATAN);
    const freq = 9;
    const amp = 0.75 * ayun;
    const sinkron = this.diTanah ? Math.sin(waktu * freq) : 0.35;
    this.kakiKiri.rotation.x = sinkron * amp;
    this.kakiKanan.rotation.x = -sinkron * amp;
    this.tanganKiri.rotation.x = -sinkron * amp * 0.9;
    this.tanganKanan.rotation.x = sinkron * amp * 0.9;
    this.badan.position.y = 1.21 + (ayun > .05 ? Math.abs(Math.sin(waktu * freq)) * 0.045 : 0);
    if (!this.diTanah) {
      this.tanganKiri.rotation.x = -1.1;
      this.tanganKanan.rotation.x = -1.1;
    }

    this._updateKamera();
  }

  _updateKamera() {
    const kepala = new THREE.Vector3(this.pos.x, this.pos.y + TINGGI_KEPALA, this.pos.z);
    const cp = Math.cos(this.kamPitch), sp = Math.sin(this.kamPitch);
    const offset = new THREE.Vector3(
      Math.sin(this.kamYaw) * cp * JARAK_KAMERA,
      sp * JARAK_KAMERA,
      Math.cos(this.kamYaw) * cp * JARAK_KAMERA
    );

    // cegah kamera menembus dinding/pohon
    let faktor = 1;
    const dir = offset.clone().normalize();
    for (const b of this.world.blockKamera) {
      const t = rayAABB(kepala, dir, b);
      if (t !== null && t > 0 && t < faktor) faktor = Math.max(0.12, t - 0.06);
    }
    offset.multiplyScalar(faktor);

    this.camera.position.copy(kepala).add(offset);
    // sedikit geser ke bawah agar karakter tidak menutupi tengah layar
    this.camera.lookAt(kepala.x, kepala.y - 0.12, kepala.z);
  }

  /* jarak horizontal ke titik (untuk interaksi) */
  jarakKe(x, z) {
    return Math.hypot(this.pos.x - x, this.pos.z - z);
  }
}
