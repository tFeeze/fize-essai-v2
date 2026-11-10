// Page About : le portrait de Tom en nuage de points (img/about-portrait.webp), à la place du logo.
// Échantillonnage grossier → on devine un visage sans vraiment le reconnaître.
// La souris (ou le doigt) repousse les points ; ils reviennent en ressort à leur place.
(() => {
  const stage = document.getElementById('stage');
  const cv = document.getElementById('scene');
  const g = cv.getContext('2d');
  const CALME = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLS = 64;                                   // finesse du nuage : plus bas = moins reconnaissable
  let pts = [], W = 0, H = 0, DPR = 1, pas = 8, img = null;
  const souris = { x: -1e4, y: -1e4, vx: 0, vy: 0 };

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
    // le portrait tient dans 82 % du cadre, centré
    const k = Math.min(W * 0.82 / COLS, H * 0.82 / rows);
    pas = k;
    const ox = (W - COLS * k) / 2, oy = (H - rows * k) / 2;
    pts = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < COLS; x++) {
      const i = (y * COLS + x) * 4;
      if (d[i + 3] < 128) continue;                  // fond détouré (PNG transparent) : le mur disparaît
      const sombre = 1 - (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      const tx = ox + (x + 0.5 + (Math.random() - 0.5) * 0.5) * k;
      const ty = oy + (y + 0.5 + (Math.random() - 0.5) * 0.5) * k;
      pts.push({ tx, ty, x: tx, y: ty, vx: 0, vy: 0, r: k * (0.12 + 0.38 * Math.sqrt(sombre)), ph: Math.random() * 6.28 });
    }
  }

  let dernier = performance.now();
  function image(t) {
    const dt = Math.min(0.05, (t - dernier) / 1000); dernier = t;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = encre();
    const R = Math.max(70, pas * 9), R2 = R * R;
    for (const p of pts) {
      if (!CALME) {
        const dx = p.x - souris.x, dy = p.y - souris.y, d2 = dx * dx + dy * dy;
        if (d2 < R2) {                               // la souris bouscule : poussée + un peu de son élan
          const d = Math.sqrt(d2) || 1, f = (1 - d / R) * (1 - d / R) * 2600;
          p.vx += (dx / d * f + souris.vx * 0.9 * (1 - d / R)) * dt;
          p.vy += (dy / d * f + souris.vy * 0.9 * (1 - d / R)) * dt;
        }
        const bx = p.tx + Math.sin(t * 0.0011 + p.ph) * pas * 0.12;   // respiration légère
        const by = p.ty + Math.cos(t * 0.0009 + p.ph) * pas * 0.12;
        p.vx += (bx - p.x) * 16 * dt; p.vy += (by - p.y) * 16 * dt;   // ressort vers sa place
        p.vx *= Math.exp(-dt * 5); p.vy *= Math.exp(-dt * 5);
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.2832); g.fill();
    }
    souris.vx *= 0.85; souris.vy *= 0.85;
    if (!CALME) requestAnimationFrame(image);
  }

  function viser(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (souris.x > -1e3) { souris.vx = (x - souris.x) * 30; souris.vy = (y - souris.y) * 30; }
    souris.x = x; souris.y = y;
  }
  addEventListener('pointermove', viser, { passive: true });
  addEventListener('pointerdown', viser, { passive: true });
  const partir = () => { souris.x = souris.y = -1e4; };
  addEventListener('pointerleave', partir); addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') partir(); });

  img = new Image();
  img.onload = () => { construire(); requestAnimationFrame(image); window.loadStep?.(1); };
  img.onerror = () => window.loadStep?.(1);
  img.src = 'img/about-portrait.webp';
  addEventListener('resize', construire);
})();
