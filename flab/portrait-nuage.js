// Page About : le portrait de Tom en nuage de points 3D (img/about-portrait.webp, fond détouré), à la place du logo.
// Échantillonnage grossier → on devine un visage sans vraiment le reconnaître.
// Relief : chaque point reçoit une profondeur (bombé de la silhouette + clair = en avant), le nuage
// pivote doucement et suit la souris. La souris (ou le doigt) repousse les points ; ils reviennent en ressort.
(() => {
  const stage = document.getElementById('stage');
  const cv = document.getElementById('scene');
  const g = cv.getContext('2d');
  const CALME = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLS = 78;                                   // finesse du nuage : plus bas = moins reconnaissable
  const RELIEF = 0.55;                               // profondeur du visage, en fraction de sa largeur
  let pts = [], W = 0, H = 0, DPR = 1, k = 8, img = null, larg = 1;
  const souris = { x: -1e4, y: -1e4, vx: 0, vy: 0, nx: 0, ny: 0 };
  const rot = { y: 0, x: 0 };

  function encre() { return getComputedStyle(document.body).color || '#000'; }

  function construire() {
    const r = stage.getBoundingClientRect();
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (!img) return;
    const rows = Math.round(COLS * img.height / img.width);
    const o = document.createElement('canvas'); o.width = COLS; o.height = rows;
    const oc = o.getContext('2d'); oc.drawImage(img, 0, 0, COLS, rows);
    const d = oc.getImageData(0, 0, COLS, rows).data;
    // distance au bord de la silhouette (chanfrein 2 passes) → bombé, comme un buste
    const dist = new Float32Array(COLS * rows), dedans = i => d[i * 4 + 3] >= 128;
    for (let i = 0; i < dist.length; i++) dist[i] = dedans(i) ? 1e6 : 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x; if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], x ? dist[i - 1] + 1 : 1, y ? dist[i - COLS] + 1 : 1);
    }
    for (let y = rows - 1; y >= 0; y--) for (let x = COLS - 1; x >= 0; x--) {
      const i = y * COLS + x; if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], x < COLS - 1 ? dist[i + 1] + 1 : 1, y < rows - 1 ? dist[i + COLS] + 1 : 1);
    }
    let dmax = 1; for (const v of dist) if (v < 1e6) dmax = Math.max(dmax, v);
    // le portrait tient dans 90 % du cadre, centré ; coordonnées du nuage centrées sur 0
    k = Math.min(W * 0.9 / COLS, H * 0.9 / rows);
    larg = COLS * k;
    pts = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      if (!dedans(i)) continue;                      // fond détouré : le mur disparaît
      const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255, sombre = 1 - lum;
      const bombe = Math.sqrt(dist[i] / dmax);
      const z = (bombe * 0.8 + (lum - 0.5) * 0.25 + (Math.random() - 0.5) * 0.06) * RELIEF * larg;
      pts.push({
        x: (x + 0.5 - COLS / 2 + (Math.random() - 0.5) * 0.5) * k,
        y: (y + 0.5 - rows / 2 + (Math.random() - 0.5) * 0.5) * k,
        z, ox: 0, oy: 0, vx: 0, vy: 0, sx: 0, sy: 0,
        r: k * (0.2 + 0.42 * Math.sqrt(sombre)), ph: Math.random() * 6.28,
      });
    }
  }

  let dernier = performance.now();
  function image(t) {
    const dt = Math.min(0.05, (t - dernier) / 1000); dernier = t;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = encre();
    // rotation : lent balancement + la souris oriente le visage
    const ty = CALME ? 0 : Math.sin(t * 0.00035) * 0.35 + souris.nx * 0.6;
    const tx = CALME ? 0 : Math.sin(t * 0.00027) * 0.08 - souris.ny * 0.3;
    rot.y += (ty - rot.y) * (1 - Math.exp(-dt * 3)); rot.x += (tx - rot.x) * (1 - Math.exp(-dt * 3));
    const cy = Math.cos(rot.y), sy = Math.sin(rot.y), cx = Math.cos(rot.x), sx = Math.sin(rot.x);
    const cam = larg * 2.2, mx = W / 2, my = H / 2;
    const R = Math.max(70, k * 10), R2 = R * R;
    for (const p of pts) {
      const z0 = p.z - RELIEF * larg * 0.4;          // pivot au milieu de l'épaisseur
      const x1 = p.x * cy + z0 * sy, z1 = -p.x * sy + z0 * cy;
      const y2 = p.y * cx - z1 * sx, z2 = p.y * sx + z1 * cx;
      const f = cam / (cam - z2);
      p.sx = mx + x1 * f; p.sy = my + y2 * f;
      if (!CALME) {
        const qx = p.sx + p.ox, qy = p.sy + p.oy;
        const dx = qx - souris.x, dy = qy - souris.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {                               // la souris bouscule : poussée + un peu de son élan
          const d = Math.sqrt(d2) || 1, a = 1 - d / R, fo = a * a * 2600;
          p.vx += (dx / d * fo + souris.vx * 0.9 * a) * dt;
          p.vy += (dy / d * fo + souris.vy * 0.9 * a) * dt;
        }
        const bx = Math.sin(t * 0.0011 + p.ph) * k * 0.12, by = Math.cos(t * 0.0009 + p.ph) * k * 0.12;   // respiration
        p.vx += (bx - p.ox) * 16 * dt; p.vy += (by - p.oy) * 16 * dt;   // ressort vers sa place
        p.vx *= Math.exp(-dt * 5); p.vy *= Math.exp(-dt * 5);
        p.ox += p.vx * dt; p.oy += p.vy * dt;
      }
      g.globalAlpha = Math.min(1, 0.35 + 0.65 * (f - 0.75) / 0.5);   // le fond du relief s'estompe
      g.beginPath(); g.arc(p.sx + p.ox, p.sy + p.oy, p.r * f, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    souris.vx *= 0.85; souris.vy *= 0.85;
    if (!CALME) requestAnimationFrame(image);
  }

  function viser(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (souris.x > -1e3) { souris.vx = (x - souris.x) * 30; souris.vy = (y - souris.y) * 30; }
    souris.x = x; souris.y = y;
    souris.nx = Math.max(-1, Math.min(1, (x - W / 2) / (W / 2)));   // orientation : position dans le cadre
    souris.ny = Math.max(-1, Math.min(1, (y - H / 2) / (H / 2)));
  }
  addEventListener('pointermove', viser, { passive: true });
  addEventListener('pointerdown', viser, { passive: true });
  const partir = () => { souris.x = souris.y = -1e4; souris.nx = souris.ny = 0; };
  document.addEventListener('pointerleave', partir);
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') partir(); });

  img = new Image();
  img.onload = () => { construire(); requestAnimationFrame(image); window.loadStep?.(1); };
  img.onerror = () => window.loadStep?.(1);
  img.src = 'img/about-portrait.webp';
  addEventListener('resize', construire);
})();
