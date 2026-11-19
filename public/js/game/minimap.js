/**
 * minimap.js — Minimap 2D di sudut kanan atas (utara di atas).
 * Menunjukkan dinding labirin, halangan, posisi pemain, dan kristal soal.
 */
export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.w = canvas.width;
    this.h = canvas.height;
    this.jangkauan = 66; // dunia +/-66 unit terlihat di peta
  }

  _sx(x) { return (x + this.jangkauan) * (this.w / (this.jangkauan * 2)); }
  _sz(z) { return (z + this.jangkauan) * (this.h / (this.jangkauan * 2)); }

  draw(posPemain, yaw, posisiSoal, jawaban, waktu, totalSoal) {
    const g = this.ctx;
    const W = this.w, H = this.h;

    g.clearRect(0, 0, W, H);
    g.save();

    // laut
    g.fillStyle = 'rgba(21, 58, 96, .95)';
    g.fillRect(0, 0, W, H);

    // pulau
    const cx = this._sx(0), cy = this._sz(0);
    const rPx = 62 * (W / (this.jangkauan * 2));
    g.fillStyle = 'rgba(45, 104, 62, .98)';
    g.beginPath(); g.arc(cx, cy, rPx, 0, Math.PI * 2); g.fill();

    // labirin + halangan
    g.fillStyle = 'rgba(10, 34, 22, .85)';
    for (const c of this.world.colliders) {
      const x = this._sx(c.x - c.hx), z = this._sz(c.z - c.hz);
      const w = Math.max(1.5, c.hx * 2 * (W / (this.jangkauan * 2)));
      const h = Math.max(1.5, c.hz * 2 * (H / (this.jangkauan * 2)));
      g.fillRect(x, z, w, h);
    }

    // kristal soal
    const denyut = 0.5 + 0.5 * Math.sin(waktu * 4);
    let terdekat = null;
    let belum = 0;
    posisiSoal.forEach((p, id) => {
      const dijawab = !!(jawaban && jawaban[id]);
      if (!dijawab) { belum++; const d = Math.hypot(posPemain.x - p.x, posPemain.z - p.z); if (!terdekat || d < terdekat.jarak) terdekat = { x: p.x, z: p.z, jarak: d }; }
      const px = this._sx(p.x), pz = this._sz(p.z);
      g.beginPath();
      g.arc(px, pz, dijawab ? 3 : 4.2 + denyut * 1.6, 0, Math.PI * 2);
      g.fillStyle = dijawab ? 'rgba(72, 217, 160, .95)' : 'rgba(255, 201, 77, 1)';
      g.fill();
      if (!dijawab) {
        g.strokeStyle = 'rgba(255, 240, 190, .75)';
        g.lineWidth = 1;
        g.stroke();
      }
    });

    // pemain (segitiga arah hadap kamera)
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    const px = this._sx(posPemain.x), pz = this._sz(posPemain.z);
    const R = 6.5;
    const ux = dx * R, uz = dz * R;          // depan
    const sx2 = -dz * R * 0.62, sz2 = dx * R * 0.62; // samping
    g.beginPath();
    g.moveTo(px + ux, pz + uz);
    g.lineTo(px - ux * 0.55 + sx2, pz - uz * 0.55 + sz2);
    g.lineTo(px - ux * 0.55 - sx2, pz - uz * 0.55 - sz2);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.2; g.stroke();

    // kompas
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.font = 'bold 11px "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillText('U', W / 2, 13);

    g.restore();

    return { terdekat, belum, total: totalSoal };
  }
}
