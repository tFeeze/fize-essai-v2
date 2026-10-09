// Page Finitions : chaque carte montre une pièce en 3D dans sa finition. Un seul canvas plein écran (un seul
// contexte WebGL) dessine toutes les cartes visibles, chacune dans son cadre (viewport + scissor).
// On fait tourner une pièce en la glissant (souris ou doigt) ; sinon elle tourne lentement.
import * as THREE from 'three';
import { finishMaterial } from './matieres.js?v=ba23a129';

const canvas = document.querySelector('.fin-canvas');
const cards = [...document.querySelectorAll('.fin')];
const byslug = Object.fromEntries((window.PIECES_V2 || []).map(m => [m.slug, m]));
const TOUCH = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(true);
renderer.setClearColor(0x000000, 0);

// studio commun : fond sombre et panneaux lumineux, pour les reflets du métal, du vernis et de la résine
function studio() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x141416, side: THREE.BackSide })));
  const panel = (x, y, z, w, h, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(-3.2, 0.5, 1.5, 5, 0.9, 9); panel(3.0, 1.6, 0.8, 4, 0.72, 7); panel(0.3, -3.4, 1.0, 5, 0.9, 3);
  panel(0.5, 2.6, -3.2, 4, 4, 6); panel(-2.8, -1.2, -2.4, 3, 3, 4); panel(1.5, 1.0, 4.0, 6, 6, 0.8);
  return s;
}
const env = new THREE.PMREMGenerator(renderer).fromScene(studio(), 0.02).texture;

const bytes = b => Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer;
function geometry(d, scale, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(new Int16Array(bytes(d.pos)), v => v / 32767 * scale), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Float32Array.from(new Int8Array(bytes(d.nor)), v => v / 127), 3));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(Float32Array.from(new Uint8Array(bytes(col)), v => (v / 255) ** 2.2), 3));
  g.setIndex(new THREE.BufferAttribute(d.wide ? new Uint32Array(bytes(d.idx)) : new Uint16Array(bytes(d.idx)), 1));
  return g;
}

const views = cards.map((card, i) => {
  const src = byslug[card.dataset.piece];
  if (!src) return null;
  // la finition montrée peut différer de la pièce livrée (ex. le scooter, montré apprêté)
  const m = { ...src, matiere: card.dataset.matiere || src.matiere, couleur: card.dataset.couleur || src.couleur };
  const scene = new THREE.Scene(); scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.25));
  const mesh = new THREE.Mesh(geometry(src, src.scale, m.matiere === 'multi' ? src.col : null), finishMaterial(THREE, m));
  if (src.interieur) {                              // ce qu'on voit à travers (carte dans le boîtier)
    const d = src.interieur;
    const inner = new THREE.Mesh(geometry(d, src.scale, d.col),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.15, clearcoat: 0.4 }));
    inner.renderOrder = -1; mesh.add(inner); mesh.renderOrder = 1;
  }
  const pivot = new THREE.Group(); pivot.add(mesh); scene.add(pivot);
  mesh.geometry.computeBoundingSphere();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  const v = { card, el: card.querySelector('.fin-view'), scene, camera, pivot, tilt: src.incline || 0,
              ry: +(card.dataset.cap || 0) + (i % 2 ? -0.5 : 0.5), vy: 0.005, rx: 0, drag: null, r: mesh.geometry.boundingSphere.radius };
  // glisser pour tourner, avec de l'élan
  v.el.addEventListener('pointerdown', e => { v.drag = { x: e.clientX, y: e.clientY }; v.el.setPointerCapture(e.pointerId); });
  v.el.addEventListener('pointermove', e => {
    if (!v.drag) return;
    v.vy = (e.clientX - v.drag.x) * 0.008; v.rx = Math.max(-0.9, Math.min(0.9, v.rx + (e.clientY - v.drag.y) * 0.006));
    v.drag = { x: e.clientX, y: e.clientY };
  });
  v.el.addEventListener('pointerup', () => { v.drag = null; });
  v.el.addEventListener('pointercancel', () => { v.drag = null; });
  return v;
}).filter(Boolean);

function size() {
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
}
addEventListener('resize', size); size();

const clock = new THREE.Clock();
(function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05), H = innerHeight;
  renderer.setScissor(0, 0, innerWidth, H); renderer.setViewport(0, 0, innerWidth, H); renderer.clear();
  for (const v of views) {
    const r = v.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > H || r.width < 2) continue;      // hors de l'écran : rien à dessiner
    if (!v.drag) { v.vy += (0.005 - v.vy) * 0.03; v.rx *= 0.97; }
    v.ry += v.vy * dt * 60;
    v.pivot.rotation.set(v.tilt + v.rx + 0.18, v.ry, 0);
    v.camera.aspect = r.width / r.height;
    const fov = THREE.MathUtils.degToRad(v.camera.fov);
    v.camera.position.set(0, 0, v.r / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * v.camera.aspect)) / 2) * 1.08);
    v.camera.updateProjectionMatrix();
    const y = H - r.bottom;                                        // WebGL compte depuis le bas
    renderer.setViewport(r.left, y, r.width, r.height); renderer.setScissor(r.left, y, r.width, r.height);
    renderer.render(v.scene, v.camera);
  }
})();
