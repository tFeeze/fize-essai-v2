import * as THREE from 'three';
import { finishMaterial as finishMat } from './matieres.js?v=ba23a129';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Moteur 3D commun à toutes les pages : le logo en chrome, qui suit la souris.
// Chaque page le configure avec window.LOGO_CONFIG :
//   mode : 'scroll' → sur Finitions, la liste des étapes suit les sections (data-stage) et le logo
//          fait un quart de tour à chaque passage ; 'fixed' ailleurs
//   frame : part de la hauteur du cadre occupée par le logo (0,42 par défaut)
//   orbit : true (canvas plein écran) ou 'stage' (dans le cadre du logo) ; orbitScale : taille des pièces
window.loadStep?.(0.8);   // le moteur 3D est chargé
// V2 interactive : pièces fines (rendus.json → models-v2.js), chacune avec sa vraie matière
if (window.PIECES_V2) window.LOGO_MODELS = window.PIECES_V2;
// V3 : sur téléphone, 4 pièces seulement (le boîtier Raspberry Pi et la plaque Eiffage restent sur ordinateur)
if (window.LOGO_MODELS && matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 700)
  window.LOGO_MODELS = window.LOGO_MODELS.filter(m => !['rpi-case', 'plaque-logo'].includes(m.slug));
const CFG = Object.assign({ mode: 'fixed', stage: 0, frame: 0.42 }, window.LOGO_CONFIG);
// Téléphone et tablette : le logo ne suit pas de souris et ne tourne pas, donc une image du logo
// en chrome (fond et étoile transparents) remplace le rendu 3D : rien à calculer à chaque image.
const FLAT = false;                               // le logo 3D chrome partout, ordinateur et téléphone (avant : image sur téléphone)
const TOUCH = matchMedia('(pointer: coarse)').matches;

const canvas = document.getElementById('scene');
const stageEl = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
const DPR = Math.min(devicePixelRatio, TOUCH ? 1.5 : 2);   // téléphone : 2 canvas plein écran, on allège
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
// Studio : bandes lumineuses sur fond sombre → reflets contrastés pour le chrome et le vernis.
// clair = true (page sur fond noir, ex. Contact) : studio clair → chrome argenté, lisible sur le noir
function studio(clair = false) {
  const env = new THREE.Scene();
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  if (clair) { grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.45, '#c9c9c9');
    grad.addColorStop(0.52, '#5a5a5a'); grad.addColorStop(0.7, '#b8b8b8'); grad.addColorStop(1, '#f2f2f2'); }
  else { grad.addColorStop(0, '#9a9a9a'); grad.addColorStop(0.45, '#444');
    grad.addColorStop(0.52, '#080808'); grad.addColorStop(0.7, '#2a2a2a'); grad.addColorStop(1, '#777'); }
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 1024);
  g.save(); g.translate(1024, 512); g.rotate(-0.5);
  for (let x = -1600; x < 1600; x += 320) {
    const w = 18 + ((x / 320) % 3 + 3) % 3 * 26;
    const b = g.createLinearGradient(x, 0, x + w, 0);
    b.addColorStop(0, 'rgba(255,255,255,0)'); b.addColorStop(0.5, 'rgba(255,255,255,0.7)'); b.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = b; g.fillRect(x, -1400, w, 2800);
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
  return env;
}
// V3 : page à fond sombre (Contact) → logo en chrome clair
const PAGE_SOMBRE = (() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g); return !!c && +c[0] + +c[1] + +c[2] < 150; })();
scene.environment = pmrem.fromScene(studio(PAGE_SOMBRE), 0.02).texture;

const BASE_FOV = 30;
const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.01, 100);   // plan proche très court : la caméra traverse l'étoile sans couper le logo
const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 4, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-4, -1, 3); scene.add(fill);

// rig = ce qui suit la souris et pivote pendant les transformations
const rig = new THREE.Group(); scene.add(rig);

const U = { uTime: { value: 0 } };

// ── Logo ──────────────────────────────────────────────
const pivot = new THREE.Group(); rig.add(pivot);
// V3 (logo F-LAB) : centre de l'étoile mesuré sur le logo (logo-flab/etoile.py → star-outline.json)
const STAR_C = window.LOGO_STAR?.centre || [0.0766, 0.0282];
// V3 — apparition : un simple fondu du logo, en arrivant sur l'accueil (haut de page, sans transition en cours)
if (document.body.classList.contains('work') && scrollY < 10 && !document.documentElement.classList.contains('warp-in')
    && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  canvas.style.opacity = '0';
  setTimeout(() => {
    canvas.style.transition = 'opacity 1.2s ease'; canvas.style.opacity = '1';
    setTimeout(() => { canvas.style.transition = canvas.style.opacity = ''; }, 1300);   // rend la main au CSS
  }, 150);
}
const obj = FLAT ? new THREE.Group() : new OBJLoader().parse(window.LOGO_OBJ);   // modèle non chargé sur téléphone
const box = new THREE.Box3().setFromObject(obj);
const size = FLAT ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
const center = FLAT ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
const s = 1 / Math.max(size.x, size.y);
const LOGO_AR = size.y / size.x;                     // hauteur / largeur du logo
document.documentElement.style.setProperty('--logo-ratio', (size.y / size.x).toFixed(3));   // V3 : hauteur / largeur du logo choisi

// Logo en chrome : métal poli, face bombée optiquement pour que les reflets glissent quand il pivote,
// grain fin par-dessus. Un seul calcul simple par pixel, léger pour les téléphones.
const material = new THREE.MeshPhysicalMaterial({ color: 0xf5f5f5, metalness: 1, roughness: 0.06, envMapIntensity: 1.2 });
material.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, U, { uBend: { value: 0.25 / (0.5 / s) } });
  sh.vertexShader = 'uniform float uBend;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>',
    `#include <beginnormal_vertex>
     if (abs(objectNormal.z) > 0.9) objectNormal = normalize(objectNormal + vec3(position.xy * uBend, 0.0));`);
  sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
    `#include <dithering_fragment>
     gl_FragColor.rgb += (fract(sin(dot(floor(gl_FragCoord.xy) + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.035;`);
};
obj.traverse(m => { if (m.isMesh) {
  m.material = material;
  m.geometry.translate(-center.x, -center.y, -center.z);
  m.geometry.computeVertexNormals();
} });
pivot.scale.setScalar(s);
pivot.add(obj);
// plaque blanche percée de l'étoile (transition vers un projet) : carré du logo, trou = contour de l'étoile
// (LOGO_STAR, légèrement resserré pour rester dans le carré), posée juste derrière le logo
const starPlate = (() => {
  const g = new THREE.Group();
  if (FLAT || !window.LOGO_STAR) return g;
  const hx = size.x / 2, hy = size.y / 2, st = window.LOGO_STAR;
  const sx = STAR_C[0] / s, sy = STAR_C[1] / s;                 // centre de l'étoile (unités du modèle)
  const sh = new THREE.Shape([new THREE.Vector2(-hx, -hy), new THREE.Vector2(hx, -hy), new THREE.Vector2(hx, hy), new THREE.Vector2(-hx, hy)]);
  sh.holes.push(new THREE.Path(st.pts.map(([x, y]) => {
    const X = x / s, Y = y / s;
    return new THREE.Vector2(Math.max(-hx * 0.985, Math.min(hx * 0.985, sx + (X - sx) * 0.985)),
                             Math.max(-hy * 0.985, Math.min(hy * 0.985, sy + (Y - sy) * 0.985)));
  }).reverse()));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }));
  m.position.z = -size.z / 2 * 1.02;
  g.add(m); g.visible = false; pivot.add(g); return g;
})();


let flat = null;                                 // téléphone : l'image du logo (voir FLAT)
if (FLAT) {
  rig.visible = false;
  flat = document.createElement('img');
  flat.src = 'img/logo-chrome.webp'; flat.alt = ''; flat.className = 'logo-flat'; flat.decoding = 'async';
  stageEl.appendChild(flat);
}


// ── Pièces en orbite (page d'accueil : LOGO_CONFIG.orbit + models-data.js) ─────────
// Des pièces imprimées à l'atelier lévitent et tournent autour du logo, chacune dans un filament.
// window.setOrbit(v) les fait disparaître (v = 0) quand on quitte l'ouverture.
// Les pièces ont leur propre canvas plein écran, fixe : le cadre du logo peut rétrécir vers le médaillon
// sans les emporter. Même éclairage que le logo, même cadrage que l'ouverture.
// orbit: 'stage' → les pièces restent dans le cadre du logo (page Contact, où le cadre ne bouge pas)
const IN_STAGE = CFG.orbit === 'stage';
const PAD = 0.18;                                   // V3 : marge floutée autour des vignettes photos (part de leur taille)
// ESSAI V3 : vignettes photos derrière les pièces de l'accueil (sélecteur « Photos » ; choix gardé dans le navigateur)
let FOND_PHOTOS = false; try { FOND_PHOTOS = document.body.classList.contains('work') && localStorage.getItem('fize-fond') === 'photos'; } catch (e) {}
// ESSAI « studio » (inspiration Wide Angle Studio) : pièces en couleur franche, matière laiteuse, contre-jour
// qui fait briller les bords, forte exposition et grand angle. false → retour aux pièces grises.
const STUDIO = false;     // 'gomme' (matière mate type Crocs) · 'contre-jour' (rendu photo du micro) · false
const orbitScene = IN_STAGE ? scene : new THREE.Scene();
const orbit = new THREE.Group(); orbitScene.add(orbit);
const orbitCam = IN_STAGE ? camera : new THREE.PerspectiveCamera(STUDIO ? 52 : 30, 1, 0.1, 100);   // STUDIO : grand angle, les pièces proches se déforment
let orbitRenderer = null;
if (CFG.orbit && window.LOGO_MODELS && !IN_STAGE) {
  const c = document.createElement('canvas'); c.className = 'orbit-canvas'; document.body.appendChild(c);
  orbitRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  orbitRenderer.setPixelRatio(DPR);
  orbitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  orbitRenderer.outputColorSpace = THREE.SRGBColorSpace;
  orbitScene.environment = new THREE.PMREMGenerator(orbitRenderer).fromScene(studio(), 0.02).texture;
  orbitScene.add(key.clone(), fill.clone());
  if (STUDIO === 'contre-jour') {                // surexposé, comme une photo sur fond blanc
    orbitRenderer.toneMappingExposure = 0.95;
    const back = new THREE.DirectionalLight(0xffffff, 2.2); back.position.set(-2, 3, -6); orbitScene.add(back);
  } else if (STUDIO === 'gomme') {                // studio doux : lumière enveloppante, ombres claires
    orbitScene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0ab, 0.35));
    const top = new THREE.DirectionalLight(0xffffff, 1.9); top.position.set(2, 5, 4); orbitScene.add(top);
  }
  let fw = 0, fh = 0;
  const fit = e => {
    // le canvas a la hauteur du grand écran (100lvh) : la barre de Safari qui se replie au défilement
    // ne le change pas, on ne recalcule donc rien pendant le scroll
    const W = c.clientWidth, H = c.clientHeight;
    if (W === fw && H === fh && e?.type !== 'logoframe') return;
    fw = W; fh = H;
    orbitRenderer.setSize(W, H, false);
    orbitCam.aspect = W / H;
    const frac = Math.min(CFG.frame, CFG.frame * orbitCam.aspect);
    orbitCam.position.set(0, 0, (1 / frac) / 2 / Math.tan(THREE.MathUtils.degToRad(orbitCam.fov / 2)));
    orbitCam.updateProjectionMatrix();
  };
  addEventListener('resize', fit); addEventListener('logoframe', fit); fit();
}
const pieces = [];
// ── Grand angle sur les pièces (ordinateur) ─────────────────────────────────────────
// Les pièces passent par un dernier calcul qui étire l'image vers les bords du cadre, comme un objectif
// grand angle : plus une pièce s'approche du bord, plus elle s'allonge vers l'extérieur ; le centre ne
// bouge presque pas. Léger dédoublement rouge/bleu tout au bord. Le survol tient compte de la déformation.
const WIDE = false, WIDE_K = 0.55, WIDE_CA = 0.0012;   // V3 : plus de grand angle (ni ordinateur ni téléphone) ; reste pour le mode PSY
// ── Easter egg « psyché » : taper F-I-Z-E au clavier, ou toucher 5 fois de suite le logo.
// Grand angle et aberration chromatique à fond, qui ondulent ; tourbillon ; couleurs qui dérivent.
let psy = 0, psyOn = false;                       // psy : intensité affichée (0 → 1, en fondu)
let wide = null;
if (orbitRenderer) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uAspect: { value: 1 }, uK: { value: WIDE_K }, uCA: { value: WIDE_CA }, uPsy: { value: 0 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAspect, uK, uCA, uPsy, uT; varying vec2 vUv;
      // distance au centre mesurée en fraction du cadre (pas en pixels) : l'effet est aussi fort en largeur
      // qu'en hauteur, que l'écran soit en paysage (ordinateur) ou en portrait (téléphone)
      vec2 bend(vec2 c) {
        float r2 = dot(c, c);
        float a = uPsy * sin(uT * 0.9 + sqrt(r2) * 7.0) * 0.28;          // tourbillon (psyché)
        c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
        float k = uK + uPsy * (0.75 + 0.3 * sin(uT * 1.3));
        c += uPsy * 0.007 * vec2(sin(c.y * 24.0 + uT * 4.0), cos(c.x * 24.0 + uT * 3.3));   // vagues         // grand angle qui respire
        return c * (1.0 - k * r2) + 0.5; }
      vec3 hue(vec3 col, float h) {                                       // rotation de teinte
        const vec3 w = vec3(0.57735); float c = cos(h), s = sin(h);
        return col * c + cross(w, col) * s + w * dot(w, col) * (1.0 - c); }
      void main() {
        vec2 c = vUv - 0.5;
        float ca = uCA + uPsy * (0.012 + 0.006 * sin(uT * 2.1));             // aberration chromatique à fond
        float e = dot(c, c) * ca * 8.0 + uPsy * 0.004;
        vec2 off = uPsy * vec2(sin(uT * 3.0 + c.y * 20.0), cos(uT * 2.4 + c.x * 20.0)) * 0.003;
        vec4 g = texture2D(tDiffuse, bend(c));
        vec4 r = texture2D(tDiffuse, bend(c * (1.0 - e)) + off);
        vec4 b = texture2D(tDiffuse, bend(c * (1.0 + e)) - off);
        vec4 col = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
        col.rgb = mix(col.rgb, hue(col.rgb, uT * 2.0 + length(c) * 8.0) * 1.3, uPsy * 0.6);
        gl_FragColor = col;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(q);
  wide = { rt, mat, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}
const wideOn = () => wide && (WIDE || psy > 0.002);
// fond kaléidoscope (mode psyché) : un petit canvas WebGL sous toute la page, créé au premier passage
let kal = null;
function kaleido() {
  if (kal) return kal;
  const c = document.createElement('canvas'); c.className = 'psy-kal'; document.body.prepend(c);
  const gl = c.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) return (kal = { draw() {} });
  const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); return o; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `precision highp float; uniform vec2 uR; uniform float uT, uA;
    vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * uR) / min(uR.x, uR.y);
      float r = length(p), a = atan(p.y, p.x) + uT * 0.12;
      const float N = 8.0; float seg = 6.2831 / N;                       // 8 miroirs
      a = abs(mod(a, seg) - seg * 0.5);
      vec2 q = vec2(cos(a), sin(a)) * r;
      q = q * (1.6 + 0.4 * sin(uT * 0.3)) + vec2(uT * 0.08, 0.0);          // le motif avance et respire
      vec3 col = vec3(0.0);
      for (int i = 0; i < 5; i++) {                                       // formes repliées sur elles-mêmes
        q = abs(q) / clamp(dot(q, q), 0.15, 4.0) - vec2(0.72, 0.55) - 0.06 * sin(uT * 0.21);
        float d = abs(sin(length(q) * 3.0 - uT * 0.6));                   // fines lignes concentriques
        col += pal(float(i) * 0.19 + r * 0.6 + uT * 0.04) * smoothstep(0.35, 0.0, d) * 0.45;
      }
      col = clamp(col + pal(r * 0.8 - uT * 0.05) * 0.18, 0.0, 1.0);
      gl_FragColor = vec4(mix(vec3(1.0), col, uA), 1.0);
    }`));
  gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(pr, 'uR'), uT = gl.getUniformLocation(pr, 'uT'), uA = gl.getUniformLocation(pr, 'uA');
  return (kal = { draw(t, a) {
    const k = Math.min(devicePixelRatio, 1) * 0.6, w = Math.round(innerWidth * k), h = Math.round(innerHeight * k);   // basse définition : c'est un fond flou
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(uR, w, h); gl.uniform1f(uT, t); gl.uniform1f(uA, a); gl.drawArrays(gl.TRIANGLES, 0, 3);
  } });
}
function togglePsy() {
  psyOn = !psyOn;
  document.documentElement.classList.toggle('psy', psyOn);
  const t = document.createElement('div'); t.className = 'psy-toast'; t.textContent = psyOn ? '◉ MODE PSYCHÉ' : '○ RETOUR AU CALME';
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}
{ let typed = '', taps = [];
  addEventListener('keydown', e => { if (e.target.closest?.('input, textarea')) return;
    typed = (typed + e.key.toLowerCase()).slice(-4); if (typed === 'fize') togglePsy(); });
  // le calque du logo laisse passer les clics (ordinateur) : on regarde si le clic tombe sur la zone du logo
  addEventListener('pointerdown', e => { const r = stageEl.getBoundingClientRect(), half = CFG.frame * Math.min(r.width, r.height) / 2;
    if (Math.abs(e.clientX - r.left - r.width / 2) > half || Math.abs(e.clientY - r.top - r.height / 2) > half) return;
    const n = performance.now(); taps = taps.filter(x => n - x < 1600); taps.push(n);
    if (taps.length >= 5) { taps = []; togglePsy(); } });
  if (window.PSY_START || location.hash === '#psyche') setTimeout(togglePsy, 600);
  // lien « PSY » du pied de page : sur la page 3D même, on remonte en haut et on bascule sans recharger
  document.addEventListener('click', e => { const l = e.target.closest?.('a.psy-link'); if (!l || !orbitRenderer) return;
    e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); togglePsy(); });       // lien direct vers l'easter egg
}
// un point de l'écran → l'endroit correspondant de l'image non déformée (pour viser les pièces)
const unwide = (nx, ny, asp) => {
  if (!wideOn()) return [nx, ny];
  const cx = nx / 2, cy = ny / 2, f = 1 - (wide.mat.uniforms.uK.value + psy * 0.75) * (cx * cx + cy * cy);
  return [cx * f * 2, cy * f * 2];
};
// ── Impression à l'apparition ────────────────────────────────────────────────────
// Chaque pièce se construit de bas en haut, couche par couche, comme sur le plateau : au-dessus de la
// couche en cours, rien ; la couche en cours brille (filament chaud) ; des particules convergent vers elle
// depuis l'espace autour, comme le fil qui se dépose. uLevel : hauteur imprimée (repère de la pièce, -1 → 1).
const PRINT = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAYER = 0.022;                               // épaisseur d'une couche (la pièce mesure 2 de haut)
const PRINT_SPEED = new URLSearchParams(location.search).has('lent') ? 0.2 : 1;   // ?lent : ralenti, pour régler
let printClock = 0;                                // temps d'animation réel (les à-coups de chargement ne comptent pas)
function printable(mat, hot) {
  const u = { uLevel: { value: PRINT ? -1.2 : 9 }, uHot: { value: hot } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying float vBy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vBy = position.y;');
    sh.fragmentShader = 'uniform float uLevel; uniform vec3 uHot; varying float vBy;\n' + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vBy > uLevel) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float hotL = 1.0 - smoothstep(0.0, ${(LAYER * 2.5).toFixed(3)}, uLevel - vBy);
        totalEmissiveRadiance += uHot * hotL * 1.6;`);
  };
  return u;
}
// V3 : pièces grisées au repos (même relief, mêmes reflets, sans la couleur) ; leur vraie couleur revient
// en fondu au survol (ordinateur) ou au premier toucher (téléphone). u.value : 1 = gris, 0 = couleur.
function greyable(mat, u) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uGrey = u;
    sh.fragmentShader = 'uniform float uGrey;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float lumG = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lumG * 0.92 + 0.04), uGrey);`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + ':gris';
}
function filament(geo, color, u) {
  const src = geo.attributes.position, n = Math.min(1600, src.count), step = src.count / n;
  const target = new Float32Array(n * 3), dir = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const j = Math.floor(k * step);
    target.set([src.getX(j), src.getY(j), src.getZ(j)], k * 3);
    const a = Math.random() * Math.PI * 2, b = Math.random() * 0.8 + 0.2;   // les grains arrivent de côté et d'en haut
    dir.set([Math.cos(a) * 1.4, b * 1.2, Math.sin(a) * 1.4], k * 3);
    seed[k] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(target, 3));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uLevel: u.uLevel, uColor: { value: color }, uPx: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `uniform float uLevel; uniform float uPx; attribute vec3 aDir; attribute float aSeed; varying float vA;
      void main() {
        float d = position.y - uLevel;                      // distance à la couche en cours
        float span = 0.35 + aSeed * 0.25;
        float t = clamp(1.0 - d / span, 0.0, 1.0);          // 0 : encore loin · 1 : déposé
        vA = (d > 0.0 && d < span) ? t : 0.0;               // visible seulement en vol
        vec3 p = position + aDir * pow(1.0 - t, 2.0) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (2.0 + 3.0 * (1.0 - t)) * (6.0 / -mv.z);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main() { if (vA <= 0.0) discard; float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(uColor, vA * (1.0 - r * 2.0)); }`,
    transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return pts;
}
const projectOf = slug => (window.PROJECTS || []).find(p => p.slug === slug);
let orbitShow = window.ORBIT_START ?? 1, orbitShown = orbitShow;   // la page peut la fixer avant le chargement du moteur
window.setOrbit = v => { orbitShow = v; };
// au repos, toutes les pièces sont d'un gris neutre ; au survol, elles prennent une couleur sourde :
// celle de leur projet (tirée de sa photo) si elle existe, sinon leur filament d'origine, adoucie
const NEUTRAL = new THREE.Color('#9d9c98');
const muted = hex => { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);   // adoucie, mais jamais grise
  return c.setHSL(hsl.h, Math.min(0.55, Math.max(0.32, hsl.s * 0.7)), Math.min(0.6, Math.max(0.45, hsl.l))); };
const bright = hex => { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);  // STUDIO : couleur franche
  return c.setHSL(hsl.h, Math.min(0.9, Math.max(0.68, hsl.s * 1.25)), Math.min(0.46, Math.max(0.34, hsl.l))); };
// contre-jour : à partir d'une couleur, le cœur (sombre, très saturé) et le bord (clair)
const gum = hex => { const c = new THREE.Color(hex), hsl = {}; c.getHSL(hsl);   // gomme : couleur franche, ni sombre ni pastel
  return c.setHSL(hsl.h, Math.min(0.92, Math.max(0.7, hsl.s * 1.25)), Math.min(0.46, Math.max(0.36, hsl.l))); };
const backlit = (p, c) => { const hsl = {}; c.getHSL(hsl);
  p.mat.userData.uDeep.value.setHSL(hsl.h, 1, 0.13); p.mat.userData.uRim.value.setHSL(hsl.h, 1, 0.62); };
const vivid = hex => { const hsl = {}; new THREE.Color(hex).getHSL(hsl); return hsl.s > 0.18; };
// matière « finie » d'une pièce V2 (mêmes matières que le rendu Blender) — calculée dans le shader, sans image
const finishMaterial = m => finishMat(THREE, m);
if (CFG.orbit && window.LOGO_MODELS) {
  const COLORS = ['#ff7a00', '#2d5bd6', '#e63946', '#f1eee7', '#ff5fa2', '#2bb24c'];
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  window.LOGO_MODELS.forEach((m, i) => {
    const q = new Int16Array(bytes(m.pos));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(q, v => v / 32767), 3));
    if (m.scale) g.attributes.position.array.forEach((v, k, a) => { a[k] = v * m.scale; });
    if (m.nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(Float32Array.from(new Int8Array(bytes(m.nor)), v => v / 127), 3));
    if (m.col) g.setAttribute('color', new THREE.Float32BufferAttribute(Float32Array.from(new Uint8Array(bytes(m.col)), v => (v / 255) ** 2.2), 3));
    g.setIndex(new THREE.BufferAttribute(m.wide ? new Uint32Array(bytes(m.idx)) : new Uint16Array(bytes(m.idx)), 1));
    let geo, mat, flatPic = null;
    const prj = projectOf(m.slug);
    if (m.matiere) { geo = g; mat = finishMaterial(m); }      // V2 : vraie matière, normales fournies
    else if (prj?.orbit_image) {
      // ESSAI : la pièce est remplacée par un rendu photo détouré (projects.json : "orbit_image"),
      // posé sur un plan face à la caméra ; il flotte et se balance, mais ne tourne pas sur lui-même
      const r = prj.orbit_ratio || 1;
      geo = new THREE.PlaneGeometry(2 * Math.min(1, r), 2 * Math.min(1, 1 / r));
      const tex = new THREE.TextureLoader().load('img/' + prj.orbit_image);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
      flatPic = true;
    } else if (STUDIO === 'gomme') {
      // Matière gomme mate (type Crocs) : teinte unie saturée, reflets larges et doux, ombres jamais noires,
      // et un grain de surface très léger (bruit dans la normale, calculé sur la position : pas besoin d'UV)
      geo = g; geo.computeVertexNormals();
      mat = new THREE.MeshPhysicalMaterial({ color: gum(COLORS[i % COLORS.length]), roughness: 0.46, metalness: 0,
        envMapIntensity: 0.6, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'),
        clearcoat: 0.12, clearcoatRoughness: 0.5, side: THREE.DoubleSide });   // double face : les facettes retournées par la simplification ne font plus de taches
      mat.onBeforeCompile = sh => {
        sh.vertexShader = 'varying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = position;');
        sh.fragmentShader = 'varying vec3 vObj;\nfloat h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }\n' + sh.fragmentShader
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            vec3 q = floor(vObj * 90.0);
            normal = normalize(normal + (vec3(h3(q), h3(q + 17.0), h3(q + 41.0)) - 0.5) * 0.09);`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.03;');
      };
    } else if (STUDIO) {
      // Rendu « contre-jour » (comme le rendu photo du micro) : une seule teinte par pièce, cœur sombre et
      // saturé, bords qui s'éclaircissent jusqu'au presque blanc, et un halo qui déborde de la silhouette.
      geo = g; geo.computeVertexNormals();                            // surfaces lissées : la lumière glisse
      const uRim = { value: new THREE.Color() }, uDeep = { value: new THREE.Color() };
      mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, envMapIntensity: 0.18,
        clearcoat: 0.45, clearcoatRoughness: 0.2 });
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, { uRim, uDeep });
        sh.fragmentShader = 'uniform vec3 uRim; uniform vec3 uDeep;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = uDeep * diffuseColor.rgb;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float ndv = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
            float rim = pow(1.0 - ndv, 2.6);
            totalEmissiveRadiance += (uDeep * 0.18 + mix(uRim, vec3(1.0), rim * rim) * rim * 1.6) * diffuse;`);
      };
      // halo : une coque un peu plus grande, vue de l'intérieur, qui ne s'allume que sur la silhouette
      const glow = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        uniforms: { uRim },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main() { vec4 mv = modelViewMatrix * vec4(position + normal * 0.025, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uRim; varying vec3 vN; varying vec3 vV;
          void main() { float f = pow(1.0 - abs(dot(vN, vV)), 3.5); gl_FragColor = vec4(uRim, f * 0.35); }`,
        side: THREE.BackSide, transparent: true, depthWrite: false }));
      mat.userData = { uRim, uDeep, glow };
    } else {
      geo = g.toNonIndexed(); geo.computeVertexNormals();             // facettes nettes, rendu « pièce imprimée »
      mat = new THREE.MeshPhysicalMaterial({ color: NEUTRAL.clone(), roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 });
      mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.18;'); };
    }
    const mesh = new THREE.Mesh(geo, mat);
    if (mat.userData.glow) mesh.add(mat.userData.glow);
    let pu = null, dots = null;
    if (!flatPic) {
      pu = printable(mat, new THREE.Color('#fff4e0'));
      // V3 : les grains qui « impriment » la pièce sont en couleur (celle de la pièce ; pour l'argent, le blanc
      // veiné, le multicolore ou la résine claire, la couleur du projet)
      let dotCol = mat.color;
      if (m.matiere) {
        const neutre = ['argent', 'blanc-or', 'multi', 'cristal'].includes(m.matiere) || !vivid(m.couleur);   // pièce noire, grise…
        const vive = [...(prj?.tint_light || []), ...(prj?.colors || [])].find(vivid);
        dotCol = new THREE.Color(neutre ? (vive || COLORS[i % COLORS.length]) : m.couleur);
        const hsl = {}; dotCol.getHSL(hsl);                  // franchement colorés, même si la teinte du projet est sourde
        dotCol.setHSL(hsl.h, Math.max(hsl.s, 0.8), Math.min(0.6, Math.max(0.45, hsl.l)));
      }
      dots = filament(geo, dotCol, pu); dots.visible = PRINT; mesh.add(dots);
    }
    const grey = { value: 1 };
    if (m.matiere) greyable(mat, grey);
    if (m.interieur) {                    // ce qu'on voit à travers la pièce (ex. la carte dans le boîtier transparent)
      const d = m.interieur, ig = new THREE.BufferGeometry();
      ig.setAttribute('position', new THREE.Float32BufferAttribute(Float32Array.from(new Int16Array(bytes(d.pos)), v => v / 32767 * m.scale), 3));
      ig.setAttribute('normal', new THREE.Float32BufferAttribute(Float32Array.from(new Int8Array(bytes(d.nor)), v => v / 127), 3));
      ig.setAttribute('color', new THREE.Float32BufferAttribute(Float32Array.from(new Uint8Array(bytes(d.col)), v => (v / 255) ** 2.2), 3));
      ig.setIndex(new THREE.BufferAttribute(d.wide ? new Uint32Array(bytes(d.idx)) : new Uint16Array(bytes(d.idx)), 1));
      const im = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.15, clearcoat: 0.4 });
      if (pu) { const iu = printable(im, new THREE.Color('#fff4e0')); iu.uLevel = pu.uLevel; }   // s'imprime en même temps que le boîtier
      greyable(im, grey);
      const inner = new THREE.Mesh(ig, im); inner.renderOrder = -1; mesh.add(inner);
      mesh.renderOrder = 1;
    }
    const holder = new THREE.Group(); holder.add(mesh); orbit.add(holder);
    // ESSAI (V3, sélecteur « Photos » de l'accueil) : vignette photo du projet derrière la pièce, accrochée à
    // elle (elle lévite et suit la souris avec elle, sans tourner sur elle-même) ; grisée avec la pièce au repos
    let card = null, cardR = 0;
    const vImg = prj?.vignette_image || prj?.cover;            // projects.json « vignette_image » : photo dédiée à l'accueil
    if (FOND_PHOTOS && vImg && !flatPic) {
      card = new THREE.Group();
      const tex = new THREE.TextureLoader().load('img/' + vImg.replace(/\.(jpe?g|png)$/i, '-800.webp'), t => {
        // la photo est prolongée sur ses quatre côtés par une version floutée d'elle-même (remplissage sans IA) :
        // l'effet nuage se fond dans ce flou, on ne voit jamais le bord droit de l'image, et on ne la recadre pas
        const img = t.image, iw = img.width, ih = img.height, px = Math.round(iw * PAD), py = Math.round(ih * PAD);
        const W = iw + 2 * px, H = ih + 2 * py, cv = () => document.createElement('canvas');
        // 1) prolongement : la photo au centre, ses bords étirés vers l'extérieur (aucun rectangle visible)
        const e = cv(); e.width = W; e.height = H; const eg = e.getContext('2d');
        eg.drawImage(img, 0, 0, iw, 1, px, 0, iw, py);                    // haut
        eg.drawImage(img, 0, ih - 1, iw, 1, px, py + ih, iw, py);         // bas
        eg.drawImage(img, 0, 0, 1, ih, 0, py, px, ih);                    // gauche
        eg.drawImage(img, iw - 1, 0, 1, ih, px + iw, py, px, ih);         // droite
        eg.drawImage(img, 0, 0, 1, 1, 0, 0, px, py); eg.drawImage(img, iw - 1, 0, 1, 1, px + iw, 0, px, py);   // coins
        eg.drawImage(img, 0, ih - 1, 1, 1, 0, py + ih, px, py); eg.drawImage(img, iw - 1, ih - 1, 1, 1, px + iw, py + ih, px, py);
        eg.drawImage(img, px, py);
        // 2) tout est flouté d'un coup (flou « maison » compatible partout : réduit très petit puis ré-agrandi)
        const flou = k => { const sm = cv(); sm.width = Math.max(4, Math.round(W / k)); sm.height = Math.max(4, Math.round(H / k));
          const sg = sm.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(e, 0, 0, sm.width, sm.height); return sm; };
        const c = cv(); c.width = W; c.height = H; const g = c.getContext('2d');
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(flou(28), 0, 0, W, H);
        // 3) fondus très larges, en trois paliers (très flou → moyennement flou → net) : aucune frontière de netteté
        //    masque doux = petit dessin (ellipse arrondie) ré-agrandi : le bord est un dégradé, jamais un trait
        const masque = (src, x, y, w2, h2, rentre) => {
          const m = cv(); m.width = W; m.height = H; const mg = m.getContext('2d');
          const mk = cv(); mk.width = 24; mk.height = Math.max(8, Math.round(24 * h2 / w2)); const kg = mk.getContext('2d');
          const gr = kg.createRadialGradient(mk.width / 2, mk.height / 2, 0, mk.width / 2, mk.height / 2, mk.width / 2);
          gr.addColorStop(0, '#000'); gr.addColorStop(rentre, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          kg.setTransform(1, 0, 0, mk.height / mk.width, 0, 0); kg.fillStyle = gr; kg.fillRect(0, 0, mk.width, mk.width);
          mg.imageSmoothingEnabled = true; mg.imageSmoothingQuality = 'high'; mg.drawImage(mk, x, y, w2, h2);
          mg.globalCompositeOperation = 'source-in'; mg.drawImage(src, 0, 0, W, H); return m;
        };
        g.drawImage(masque(flou(9), px * 0.4, py * 0.4, W - px * 0.8, H - py * 0.8, 0.55), 0, 0);   // moyennement flou
        g.drawImage(masque(e, px * 0.85, py * 0.85, W - px * 1.7, H - py * 1.7, 0.5), 0, 0);         // net, au centre
        t.image = c; t.needsUpdate = true;
        const r = iw / ih, w = 1.9 * (prj.vignette || 1), h = w / r;   // taille de la photo : 1,9 de large (la pièce ~2) ; « vignette » : agrandie
        photo.scale.set(w * (1 + 2 * PAD), h * (1 + 2 * PAD), 1);      // le plan porte aussi la marge floutée
        cardR = Math.hypot(w / 2 + 0.45, h / 2 + 0.3) * 0.8;          // rayon réel (vignette décalée comprise), pour l'écartement
      });
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const pm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, depthWrite: false });
      // bords « en nuage » : la photo se fond dans la page par un bord très irrégulier (bruit fractal déformé),
      // différent pour chaque vignette ; il dérive lentement, et bouillonne au survol (la photo s'ouvre un peu)
      const graine = (i * 7.31) % 10;
      pm.onBeforeCompile = sh => {
        sh.uniforms.uTime = U.uTime;
        sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
          {
            #define H2(p) fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453)
            #define VN(p) mix(mix(H2(floor(p)), H2(floor(p) + vec2(1, 0)), smoothstep(0., 1., fract(p).x)), mix(H2(floor(p) + vec2(0, 1)), H2(floor(p) + vec2(1, 1)), smoothstep(0., 1., fract(p).x)), smoothstep(0., 1., fract(p).y))
            float hov = 1.0 - uGrey;                                   // 0 au repos, 1 au survol
            float t = uTime * (0.06 + 0.05 * hov);                     // dérive très lente ; un peu plus vive au survol
            vec2 q = vMapUv * 1.8 + ${graine.toFixed(2)};
            vec2 w = vec2(VN(q + vec2(t, 0.0)), VN(q + vec2(5.2, 1.3 - t))) - 0.5;   // déformation : volutes
            q += w * 1.6;
            float n = 0.0, a = 0.5;
            for (int o = 0; o < 4; o++) { n += a * VN(q + vec2(t * 0.7, -t * 0.5)); q *= 2.03; a *= 0.5; }
            float dr = min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y));  // distance au bord (rectangle)
            float de = 0.5 * (1.0 - length((vMapUv - 0.5) * 2.0) * 0.82);                  // … et à une ellipse
            float d = max(0.0, min(dr, mix(dr, de, 0.85 - 0.5 * hov)));                     // silhouette arrondie ; un peu plus droite au survol
            float edge = d * (1.0 + 0.05 * hov) - 0.42 * (1.0 - 0.55 * hov) * (n - 0.38) + 0.008 * hov;   // au survol : s'ouvre un peu, bord moins irrégulier
            diffuseColor.a *= smoothstep(0.03, 0.2, edge) * smoothstep(0.0, 0.07, dr);  // toujours nul au bord du plan
          }
          #include <opaque_fragment>`);
      };
      pm.customProgramCacheKey = () => 'nuage' + graine.toFixed(2);   // un programme par vignette (bruit différent)
      if (m.matiere) greyable(pm, grey);
      // lignes de balayage (écran cathodique) au repos ; elles s'effacent avec le gris au survol
      const prevS = pm.onBeforeCompile;
      pm.onBeforeCompile = (sh, r) => { prevS?.call(pm, sh, r);
        sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.5708);                  // une ligne sur 4 pixels
          gl_FragColor.rgb *= mix(1.0, 0.68 + 0.32 * scan, uGrey * gl_FragColor.a * gl_FragColor.a);`); };   // les lignes s'effacent avec le nuage
      const kS = pm.customProgramCacheKey.bind(pm); pm.customProgramCacheKey = () => kS() + ':scan';
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pm);
      photo.scale.set(1.9 * (prj.vignette || 1), 1.4 * (prj.vignette || 1), 1);
      card.add(photo);
      card.position.set(i % 2 ? -0.45 : 0.45, 0.3, -1.25);       // derrière la pièce, un peu décalée
      card.rotation.z = (i % 2 ? 1 : -1) * 0.07;
      holder.add(card);
    }
    // zone de survol invisible, une sphère un peu plus large que la pièce : pas de « trou » où le survol décroche
    geo.computeBoundingSphere();
    const hit = new THREE.Mesh(new THREE.SphereGeometry(geo.boundingSphere.radius * 1.05, 16, 12),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    holder.add(hit);
    mesh.rotation.set(0, flatPic ? 0 : (m.cap || 0), 0);   // V3 : face importante vers nous (rendus.json « cap »)
    pieces.push({ pu, dots, build: 0, holder, mesh, hit, slug: m.slug, grey, card, get cardR() { return cardR; }, cap: m.cap || 0, tilt: m.incline || 0, phase: i * 1.7, spin: (i % 2 ? -1 : 1) * (0.25 + 0.1 * i), grow: 1, lx: 0, ly: 0, mat, flat: flatPic, finish: !!m.matiere, rest: flatPic ? new THREE.Color('#ffffff') : STUDIO === 'gomme' ? gum(COLORS[i % COLORS.length]) : STUDIO ? bright(COLORS[i % COLORS.length]) : NEUTRAL,
      tint: (STUDIO === 'gomme' ? gum : STUDIO ? bright : muted)(COLORS[i % COLORS.length]),
      // rayon réel de la pièce (sphère qui la contient quelle que soit sa rotation), pour la garder à l'écran
      radius: geo.boundingSphere.radius + geo.boundingSphere.center.length() });
  });
}
// survol d'une pièce : elle grossit, une étiquette donne le projet ; clic → page du projet
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let hovered = null;
const tip = document.createElement('div'); tip.className = 'piece-tip'; document.body.appendChild(tip);
// pièce sous un point de l'écran (null si aucune, ou si les pièces sont parties au scroll)
function pick(cx, cy, target) {
  if (!orbit.visible || orbitShown < 0.6 || target?.closest?.('a, button, nav, .views, .piece-tip')) return null;
  const r = IN_STAGE ? stageEl.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  ndc.set(...unwide(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, r.width / r.height));
  ray.setFromCamera(ndc, orbitCam);
  // V3 : la vignette photo compte aussi (survoler l'image = survoler la pièce)
  const h = ray.intersectObjects(pieces.flatMap(p => p.card ? [p.hit, p.card.children[0]] : [p.hit]))[0];
  return h ? pieces.find(p => p.hit === h.object || p.card?.children[0] === h.object) : null;
}
// affiche (ou masque) la fiche du projet ; place(w, h) renvoie sa position une fois sa taille connue
// V3, mode Photos : pas de fiche au survol (la vignette montre déjà la photo) ; une étiquette — nom du projet
// et « Voir le projet » — se déroule, collée sous la vignette, et la suit pendant qu'elle lévite
const cardLabel = document.createElement('a'); cardLabel.className = 'card-label'; document.body.appendChild(cardLabel);
cardLabel.addEventListener('click', e => { e.preventDefault(); (window.warpTo || (u => { location.href = u; }))(cardLabel.getAttribute('href')); });
let labelPiece = null;
function cardFor(pr, p) {
  if (!pr || !p) { cardLabel.classList.remove('on'); labelPiece = null; return; }
  if (labelPiece === p) return;
  labelPiece = p;
  cardLabel.href = pr.slug + '.html';
  // logo du client (projects.json « client_logo », fichier dans src/img/) : affiché seulement s'il existe,
  // et seulement avec l'accord écrit du client (règle 9 de CLAUDE.md)
  const cl = pr.client_logo ? `<img class="cl" src="img/${pr.client_logo}" alt="${pr.client_nom || ''}" onerror="this.remove()">` : '';
  cardLabel.innerHTML = `<div class="cl-row"><b>${pr.title}</b>${cl}</div><span>Voir le projet →</span>`;
  cardLabel.classList.remove('on'); void cardLabel.offsetWidth; cardLabel.classList.add('on');   // relance l'animation
}
const _lab = new THREE.Vector3();
function placeLabel() {
  if (!labelPiece) return;
  const ph = labelPiece.card.children[0];
  const pc = 0.5 - PAD / (1 + 2 * PAD);                // coin de la photo dans le plan (hors marge floutée)
  _lab.set(-pc, -pc, 0); ph.localToWorld(_lab); _lab.project(orbitCam);              // coin bas gauche de la photo
  let cx = _lab.x / 2, cy = _lab.y / 2;
  if (wideOn()) {                                     // grand angle (téléphone) : même déformation que l'image
    const K = wide.mat.uniforms.uK.value + psy * 0.75, qx = cx, qy = cy;
    for (let it = 0; it < 6; it++) { const g = 1 - K * (cx * cx + cy * cy); if (g < 0.2) break; cx = qx / g; cy = qy / g; }
  }
  const rot = -(labelPiece.card.rotation.z + labelPiece.holder.rotation.z) * 180 / Math.PI;
  cardLabel.style.transform = `translate(${((cx + 0.5) * innerWidth).toFixed(1)}px, ${((0.5 - cy) * innerHeight).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
}
function showTip(pr, place) {
  if (FOND_PHOTOS) {
    const p = pr && pieces.find(q => q.slug === pr.slug && q.card);
    if (p || !pr) { tip.classList.remove('on'); cardFor(pr, p); return; }
  }
  tip.classList.toggle('on', !!pr);
  if (!pr) return;
  if (tip.dataset.slug !== pr.slug) {             // on ne reconstruit l'étiquette qu'en changeant de pièce
    tip.dataset.slug = pr.slug;
    const n = String((window.PROJECTS || []).indexOf(pr) + 1).padStart(2, '0');
    const pic = pr.hover_thumb || pr.thumb;           // image dédiée au survol si le projet en a une (vignette)
    tip.innerHTML = (pic ? `<div class="frame"><img src="img/${pic}" alt=""></div>` : '')
      + `<div class="txt"><i>N° ${n}</i><b>${pr.title}</b><span>${pr.cat} — ${pr.finish}</span><em>Voir le projet →</em></div>`;
    tip.style.rotate = ((pr.slug.length % 5) - 2) * 1.4 + 'deg';   // chaque fiche a sa petite inclinaison
  }
  const [x, y] = place(tip.offsetWidth, tip.offsetHeight);
  tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}
// souris : survol
addEventListener('pointermove', e => {
  if (!pieces.length || e.pointerType !== 'mouse') return;
  // V3 : l'étiquette apparue reste accessible — la souris peut y aller (et s'en approcher) sans la faire disparaître
  if (labelPiece && cardLabel.classList.contains('on')) {
    const lr = cardLabel.getBoundingClientRect(), m = 14;
    if (e.clientX > lr.left - m && e.clientX < lr.right + m && e.clientY > lr.top - m && e.clientY < lr.bottom + m) {
      hovered = labelPiece; document.body.style.cursor = 'pointer'; return;
    }
  }
  const hit = pick(e.clientX, e.clientY, e.target);
  const pr = hit && projectOf(hit.slug);
  hovered = hit;                                  // grossit au survol, même sans projet lié
  document.body.style.cursor = pr ? 'pointer' : '';   // main sur une pièce liée à un projet
  // près d'un bord, l'étiquette passe de l'autre côté du curseur pour rester à l'écran
  showTip(pr, (tw, th) => [
    e.clientX + 18 + tw > innerWidth - 8 ? e.clientX - 18 - tw : e.clientX + 18,
    e.clientY + 14 + th > innerHeight - 8 ? e.clientY - 14 - th : e.clientY + 14]);
});
// type du dernier pointeur : après un toucher, le téléphone envoie aussi un « click » (parfois sans pointerType) —
// il ne doit pas ouvrir le projet : au doigt, 1er toucher = étiquette, 2e toucher = projet (géré plus bas)
let dernierPointeur = 'mouse';
addEventListener('pointerdown', e => { dernierPointeur = e.pointerType || 'mouse'; }, { capture: true, passive: true });
addEventListener('click', e => {
  if ((e.pointerType && e.pointerType !== 'mouse') || dernierPointeur !== 'mouse') return;   // le doigt est géré plus bas
  if (hovered && !e.target.closest?.('a, button') && projectOf(hovered.slug)) (window.warpTo || (u => { location.href = u; }))(hovered.slug + '.html');
});
// doigt : un premier toucher sur une pièce la sélectionne et montre sa fiche ;
// toucher la fiche (ou la même pièce une seconde fois) ouvre le projet ; toucher ailleurs referme
let down = null;
addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') down = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
addEventListener('pointerup', e => {
  if (!pieces.length || e.pointerType === 'mouse' || !down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 600;
  down = null;
  if (moved) return;                                         // c'était un défilement, pas un toucher
  if (e.target.closest?.('.card-label')) return;             // V3 : l'étiquette est un lien, elle ouvre le projet
  const tr = tip.getBoundingClientRect();                    // toucher dans la fiche ouverte → le projet
  if (hovered && tip.classList.contains('on') && e.clientX >= tr.left && e.clientX <= tr.right && e.clientY >= tr.top && e.clientY <= tr.bottom) {
    (window.warpTo || (u => { location.href = u; }))(hovered.slug + '.html'); return;
  }
  const hit = pick(e.clientX, e.clientY, e.target);
  const pr = hit && projectOf(hit.slug);
  if (pr && hit === hovered) { (window.warpTo || (u => { location.href = u; }))(hit.slug + '.html'); return; }
  hovered = pr ? hit : null; tipY = scrollY;
  // la fiche se pose au-dessus ou au-dessous du doigt, centrée et toujours dans l'écran
  showTip(pr, (tw, th) => [
    Math.min(innerWidth - 8 - tw, e.clientX - tw / 2),
    e.clientY - 24 - th > 8 ? e.clientY - 24 - th : Math.min(innerHeight - 8 - th, e.clientY + 24)]);
});
let tipY = 0;                                                 // la fiche se referme quand on fait vraiment défiler
addEventListener('scroll', () => {
  if (!hovered || matchMedia('(hover: hover)').matches) { tipY = scrollY; return; }
  if (Math.abs(scrollY - tipY) > 40) { hovered = null; showTip(null); }
}, { passive: true });

// emplacements autour du logo, en fraction de la zone visible (x, y) — écran large puis écran en hauteur
// profondeur de chaque pièce (unités du logo, qui mesure 1) : devant / derrière le logo, pour étager la scène
const DEPTHS = [0.55, -0.9, 0.25, -0.45, 0.8, -1.3, -0.2, 0.4];
const SLOTS_WIDE = [[-0.58, 0.36], [0.6, 0.44], [-0.66, -0.4], [0.56, -0.46], [-0.08, -0.78], [0.04, 0.78], [-0.38, -0.74], [0.34, -0.76]];   // V3 : 6e (kit rose) recentré
const SLOTS_TALL = [[-0.48, 0.6], [0.5, 0.58], [-0.46, -0.62], [0.46, -0.64]];   // V3 : téléphone, 4 pièces (2 au-dessus, 2 en dessous du logo)   // téléphone : 6 pièces (2 au-dessus, 2 de côté, 2 en dessous)

// ── Cadrage (dans la colonne gauche) ───────────────────
let rw = 0, rh = 0, camZ = 5;
function resize(force) {
  // taille hors transformation (le cadre rétrécit en médaillon par transform) ; rien à refaire si elle n'a pas bougé
  const r = { width: stageEl.offsetWidth, height: stageEl.offsetHeight };
  if (force !== true && r.width === rw && r.height === rh) return;
  rw = r.width; rh = r.height;
  if (FLAT && !IN_STAGE) renderer.setSize(1, 1, false);   // l'image remplace le logo : canvas réduit au minimum
  else renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  const frac = Math.min(CFG.frame, CFG.frame * camera.aspect);   // part de la hauteur occupée par le logo
  camZ = (1 / frac) / 2 / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  camera.position.set(0, 0, camZ);
  camera.updateProjectionMatrix();
  if (flat) flat.style.width = (frac * r.height) + 'px';      // même taille que le logo 3D
}
new ResizeObserver(() => resize()).observe(stageEl); resize(true);

// ── Souris : le logo regarde le curseur (un peu moins qu'avant, le scroll fait aussi tourner)
const MAX = THREE.MathUtils.degToRad(28);
const target = { x: 0, y: 0 };
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;          // doigt ou stylet : pas de suivi
  const r = stageEl.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = ((e.clientY - r.top) / r.height) * 2 - 1;
  target.y = THREE.MathUtils.clamp(Math.atan(nx * 1.1), -MAX, MAX);
  target.x = THREE.MathUtils.clamp(Math.atan(ny * 0.9), -MAX, MAX);
});
document.addEventListener('mouseleave', () => { target.x = 0; target.y = 0; });

// Téléphone et tablette : pas de souris, le logo reste de face (seul le scroll le fait tourner).

// ── Étape visée ────────────────────────────────────────
// scroll : chaque section a son étape ; quand son centre passe au centre de l'écran, l'étape est atteinte.
// Entre deux sections, la transformation se joue dans la moitié centrale du trajet.
const sections = [...document.querySelectorAll('main section[data-stage]')];
const steps = [...document.querySelectorAll('#steps li')];
let stageTarget = CFG.stage, stageShown = CFG.stage;
function readScroll() {
  const mid = scrollY + innerHeight / 2;
  const pts = sections.map(el => ({ c: el.offsetTop + el.offsetHeight / 2, k: +el.dataset.stage }));
  if (mid <= pts[0].c) { stageTarget = pts[0].k; return; }
  for (let i = 0; i < pts.length - 1; i++) {
    if (mid < pts[i + 1].c) {
      const f = (mid - pts[i].c) / (pts[i + 1].c - pts[i].c);
      const e = THREE.MathUtils.smoothstep(f, 0.2, 0.8);
      stageTarget = pts[i].k + (pts[i + 1].k - pts[i].k) * e;
      return;
    }
  }
  stageTarget = pts[pts.length - 1].k;
}
if (CFG.mode === 'scroll' && sections.length) { addEventListener('scroll', readScroll, { passive: true }); readScroll(); }
// Accueil : réduit en médaillon (transform CSS), le logo n'a pas besoin d'être calculé en plein écran haute
// définition. La page donne l'échelle affichée ; la résolution de rendu suit, par paliers (pas de recalcul
// à chaque pixel de défilement).
let quality = 1;
window.setLogoScale = sc => {
  // deux paliers seulement, avec une marge : changer la résolution réalloue le canvas (petit à-coup),
  // on ne le fait donc qu'une fois en descendant et une fois en remontant
  const q = sc > 0.5 ? 1 : sc < 0.4 ? 0.35 : quality;
  if (q === quality || FLAT) return;
  quality = q; renderer.setPixelRatio(DPR * q); resize(true);
};
window.setLogoScale(window.LOGO_SCALE ?? 1);

// ── Transition vers un projet (ordinateur) : on passe à travers l'étoile du logo ──────────────
// Départ : le cadre du logo s'étend à tout l'écran ; le logo fait un tour et la caméra vient se placer
// face à l'étoile, assez près pour que le chrome couvre l'écran ; la page s'efface en blanc dans l'étoile.
// Arrivée : même cadrage, mais dans l'étoile on voit déjà la nouvelle page ; la caméra traverse l'étoile,
// qui s'ouvre jusqu'à révéler toute la page ; le médaillon revient ensuite. L'étoile est un vrai trou
// dans le logo 3D : la page derrière le canvas s'y voit sans aucun masque.
const STAR = new THREE.Vector3(STAR_C[0], STAR_C[1], 0);   // centre de l'étoile (repère du logo, qui mesure 1)
const warp = { mode: null, k: 0, t0: 0, dur: 1, done: null };
// « objectif grand angle collé au logo » pendant la transition : l'image du logo passe par un dernier
// calcul qui la bombe (distorsion en barillet) et décale le rouge et le bleu vers les bords
// (aberration chromatique). Seulement pendant la transition : le reste du temps, rendu direct.
let lens = null;
function lensPass() {
  if (lens) return lens;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uAmt: { value: 0 }, uAspect: { value: size.x / size.y } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt; uniform float uAspect; varying vec2 vUv;
      vec2 bend(vec2 c, float k) { vec2 a = c * vec2(uAspect, 1.0); float r2 = dot(a, a); return c * (1.0 - k * r2) + 0.5; }
      void main() {
        vec2 c = vUv - 0.5;
        float k = 0.55 * uAmt, ca = 0.045 * uAmt;
        vec4 g = texture2D(tDiffuse, bend(c, k));
        vec4 r = texture2D(tDiffuse, bend(c * (1.0 - ca), k));
        vec4 b = texture2D(tDiffuse, bend(c * (1.0 + ca), k));
        gl_FragColor = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  lens = { rt, mat, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  return lens;
}
const warpRun = (mode, dur) => new Promise(done => Object.assign(warp, { mode, dur, k: 0, t0: performance.now(), done }));
window.logoWarpOut = () => {
  if (FLAT) return null;
  document.documentElement.classList.add('warp-stage');   // cadre du logo en plein écran (site.css)
  if (document.body.classList.contains('work')) {  // accueil : le médaillon revient au centre, en pleine définition
    stageEl.style.transition = 'transform .5s cubic-bezier(.6,0,.35,1)'; stageEl.style.transform = 'none';
    window.setLogoScale(1);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); quality = -1; resize(true);   // transition : rendu allégé
  return warpRun('out', 1150);
};
// arrivée : la nouvelle page s'affiche directement (aucun écran d'attente)

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  U.uTime.value = t;
  stageShown += (stageTarget - stageShown) * (1 - Math.exp(-dt * 5));
  const st = stageShown;

  // pendant chaque transformation, le logo fait un quart de tour puis revient de face
  const tr = Math.sin(Math.PI * (st - Math.floor(st)));
  const k = 1 - Math.exp(-dt * 6);
  rig.rotation.x += (target.x - rig.rotation.x) * k;
  rig.rotation.y += (target.y + tr * 0.55 - rig.rotation.y) * k;
  rig.position.y = Math.sin(t * 0.8) * 0.012;


  steps.forEach((li, i) => li.classList.toggle('on', Math.round(st) === i));

  if (pieces.length) {
    printClock += Math.min(dt, 1 / 30) * PRINT_SPEED;   // une image lente (compilation, chargement) ne fait pas sauter l'impression
    orbitShown += (orbitShow - orbitShown) * (1 - Math.exp(-dt * 8));
    orbit.visible = orbitShown > 0.01;
    const h = 2 * orbitCam.position.z * Math.tan(THREE.MathUtils.degToRad(orbitCam.fov / 2)), w = h * orbitCam.aspect;
    const tall = orbitCam.aspect < 1, slots = CFG.slots || (tall ? SLOTS_TALL : SLOTS_WIDE);   // une page peut imposer ses emplacements
    const size = (tall ? 0.085 * w : 0.075 * h) * (STUDIO && !tall ? 1.45 : 1);   // téléphone : pièces plus petites ; STUDIO (ordinateur) : gros objets, comme la référence
    const gone = 1 - orbitShown;                        // 0 en haut de page → 1 quand on a descendu
    pieces.forEach((p, i) => {
      if (i >= slots.length) { p.holder.visible = false; return; }   // téléphone : place pour 6 pièces seulement
      p.holder.visible = true;
      const [sx, sy] = slots[i];
      // au scroll, chaque pièce s'envole vers le haut, les plus basses un peu plus vite (départ en accélérant)
      const fly = Math.pow(gone, 1.6) * h * (1.1 + 0.5 * (0.5 - sy) + 0.08 * i);
      // projets phares (projects.json : "vedette": true) : plus gros et au premier plan
      const star = !!projectOf(p.slug)?.vedette;
      const z = star ? 0.45 : DEPTHS[i % DEPTHS.length];
      // chaque pièce suit la souris avec son propre retard (celles du fond traînent davantage) :
      // le logo réagit d'abord, les pièces rattrapent ensuite, en décalé
      const lag = 1 - Math.exp(-dt * (1.7 + 0.9 * (z + 1.3) / 2.1));
      p.lx += (rig.rotation.y - p.lx) * lag;
      p.ly += (rig.rotation.x - p.ly) * lag;
      // parallaxe : les pièces de devant glissent plus que celles du fond
      // la pièce reste entière à l'écran : on la rentre si son emplacement + sa taille dépasse le bord
      // (et on corrige la perspective : une pièce plus proche de la caméra paraît plus écartée)
      const persp = (orbitCam.position.z - z) / orbitCam.position.z;
      const pr = projectOf(p.slug);
      const s = size * (star ? 1.5 : 1) * (pr?.orbit_scale || 1) * (CFG.orbitScale || 1);   // orbit_scale : projects.json
      const eff = FOND_PHOTOS && p.card ? Math.max(tall ? 1.1 : 1.5, (p.cardR || 1.5 * Math.sqrt(pr?.vignette || 1)) * (tall ? 0.68 : 1)) : p.radius;   // avec sa vignette (taille réelle)
      const reach = s * eff * Math.max(p.grow, FOND_PHOTOS ? 1.12 : 1.3);   // rayon à l'écran, y compris agrandie au survol
      p.reachS = s * eff * p.grow;
      const hw = w / 2 * persp, hh = h / 2 * persp;               // demi-largeur / demi-hauteur visibles à cette profondeur
      // position voulue (emplacement + flottement + suivi de la souris)…
      let x = sx * hw - p.lx * z * 0.6 + p.lx * 0.25;
      let y = sy * hh + Math.sin(t * 0.9 + p.phase) * 0.05 * h / 4 + p.ly * z * 0.6 - p.ly * 0.25;
      // …bornée pour que la pièce entière, même en tournant, reste dans le cadre (marge de 3 %)
      const edge = WIDE ? 0.97 * (1 - WIDE_K * 0.3) : 0.97;            // le grand angle repousse les bords : on garde la marge
      const mx = Math.max(0, hw * edge - reach), my = Math.max(0, hh * edge - reach);
      x = Math.min(mx, Math.max(-mx, x));
      const top = tall ? Math.max(0, hh * 0.87 * (WIDE ? 1 - WIDE_K * 0.3 : 1) - reach) : my;   // téléphone : on reste sous la barre de menu
      const bottom = tall ? Math.max(0, hh * 0.8 * (WIDE ? 1 - WIDE_K * 0.3 : 1) - reach) : my;  // …et au-dessus de la barre de Safari en bas
      y = Math.min(top, Math.max(-bottom, y));
      p.holder.position.set(x, y + fly, z);                        // l'envol au scroll, lui, peut sortir par le haut
      p.holder.rotation.set(p.ly * 0.5, p.lx * 0.5, 0);
      p.grow += ((p === hovered ? (FOND_PHOTOS ? 1.12 : 1.3) : 1) - p.grow) * (1 - Math.exp(-dt * 10));
      p.grey.value += ((p === hovered ? 0 : 1) - p.grey.value) * (1 - Math.exp(-dt * 7));   // V3 : la couleur revient au survol
      // couleur du projet : la première vraiment colorée de sa photo (argent, gris, blanc écartés) ;
      // sinon on garde la couleur de filament de la pièce
      if (p.flat) p.tinted = true;                   // rendu photo : ses couleurs sont dans l'image
      if (!p.tinted && pr) {
        const c = (pr.tint_light || []).find(vivid); if (c) p.tint = (STUDIO === 'gomme' ? gum : STUDIO ? bright : muted)(c); p.tinted = true;
        if (STUDIO) { p.rest = p.tint; p.tint = p.tint.clone().offsetHSL(0, 0, STUDIO === 'gomme' ? 0.07 : 0.1); }   // au survol : plus lumineuse
        if (p.mat.userData.uDeep) backlit(p, p.rest);
      }
      if (p.mat.userData.uDeep) { if (!p.lit) { backlit(p, p.rest); p.lit = true; }
        p.mat.emissiveIntensity = 1; p.mat.color.setScalar(p === hovered ? 1.25 : 1); }   // survol : plus lumineuse
      else if (!p.flat && !p.finish) p.mat.color.lerp(p === hovered ? p.tint : p.rest, 1 - Math.exp(-dt * 8));   // la couleur monte en fondu
      p.holder.scale.setScalar(s * p.grow);
      if (p.pu && p.build < 1) {
        // départ décalé d'une pièce à l'autre ; 2,6 s par pièce ; la hauteur avance par couches entières
        p.build = Math.min(1, Math.max(0, (printClock - 0.3 - i * 0.35) / 2.6));
        const e = p.build < 1 ? p.build : 1;
        p.pu.uLevel.value = p.build >= 1 ? 9 : Math.floor((-1.02 + e * 2.06) / LAYER) * LAYER + LAYER;
        if (p.build >= 1 && p.dots) { p.dots.visible = false; }
      }
      // elles restent debout : elles tournent lentement sur elles-mêmes et se balancent un peu en lévitant ;
      // au scroll, elles basculent en s'envolant
      if (p.flat) p.mesh.rotation.y = Math.sin(t * 0.5 + p.phase) * 0.25;   // image : se balance sans montrer sa tranche
      // V3 : pas de tour complet — la pièce se balance doucement autour de sa face (± 25°), et se met de face au survol
      else { p.sway = (p.sway ?? 1) + ((p === hovered ? 0.25 : 1) - (p.sway ?? 1)) * (1 - Math.exp(-dt * 4));
        p.mesh.rotation.y = p.cap + Math.sin(t * 0.45 + p.phase) * 0.44 * p.sway; }
      p.mesh.rotation.x = p.tilt + Math.sin(t * 0.7 + p.phase) * 0.08 + gone * gone * 1.2 * Math.sign(p.spin);
      p.mesh.rotation.z = Math.sin(t * 0.55 + p.phase * 1.3) * 0.1 + gone * gone * 0.8 * p.spin;
    });
    // V3 : séparation — aucune pièce (vignette comprise) ne chevauche une autre ni le logo. On calcule à
    // l'écran (plan de la caméra), on écarte les paires qui se touchent, on sort celles qui mordent sur le logo,
    // puis le décalage est appliqué en douceur (pas de saccade quand une pièce grossit au survol)
    if (!IN_STAGE && gone < 0.05) {
      const camz = orbitCam.position.z, vis = pieces.filter((p, i) => p.holder.visible && i < slots.length);
      const F = p => camz / (camz - p.holder.position.z);
      const R = p => (p.reachS || 0) * F(p) * 1.04;
      const fr = CFG.frame || 0.42, lw = fr * Math.min(innerWidth, innerHeight) / innerHeight * h;   // largeur du logo (plan z = 0)
      const LHW = lw / 2, LHH = lw * LOGO_AR / 2 + h * 0.09;   // + la ligne d'accroche, avec de l'air                              // + la ligne d'accroche
      vis.forEach(p => { p.px = 0; p.py = 0; });
      for (let it = 0; it < 4; it++) {
        for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++) {
          const A = vis[a], B = vis[b];
          const dx = (B.holder.position.x * F(B) + B.px) - (A.holder.position.x * F(A) + A.px);
          const dy = (B.holder.position.y * F(B) + B.py) - (A.holder.position.y * F(A) + A.py);
          const d = Math.hypot(dx, dy) || 1e-3, m = R(A) + R(B) - d;
          if (m > 0) { const ux = dx / d, uy = dy / d; A.px -= ux * m / 2; A.py -= uy * m / 2; B.px += ux * m / 2; B.py += uy * m / 2; }
        }
        vis.forEach(p => {
          const x = p.holder.position.x * F(p) + p.px, y = p.holder.position.y * F(p) + p.py, r = R(p);
          const lx = LHW + r, ly = LHH + r;
          if (Math.abs(x) < lx && Math.abs(y) < ly) {
            const ex = lx - Math.abs(x), ey = ly - Math.abs(y);
            if (ex / lx < ey / ly && !tall) p.px += Math.sign(x || 1) * ex; else p.py += Math.sign(y || 1) * ey;   // téléphone : au-dessus / en dessous
          }
          // et toujours dans l'écran
          const mx = w / 2 * 0.97 - r, my = h / 2 * (tall ? 0.8 : 0.97) - r;
          const nx = Math.max(-mx, Math.min(mx, p.holder.position.x * F(p) + p.px)), ny = Math.max(-my, Math.min(my, p.holder.position.y * F(p) + p.py));
          p.px = nx - p.holder.position.x * F(p); p.py = ny - p.holder.position.y * F(p);
        });
      }
      const k = 1 - Math.exp(-dt * 3);
      vis.forEach(p => {
        p.ox = (p.ox || 0) + (p.px / F(p) - (p.ox || 0)) * k; p.oy = (p.oy || 0) + (p.py / F(p) - (p.oy || 0)) * k;
        p.holder.position.x += p.ox; p.holder.position.y += p.oy;
      });
    }

  }
  // V3 : les vignettes se tournent légèrement vers le logo (au centre) : à droite elles regardent vers la
  // gauche, en haut vers le bas… ; inclinaison douce, pour garder la photo lisible
  if (FOND_PHOTOS) pieces.forEach(p => { if (!p.card) return;
    const ry = -0.38 * Math.max(-1, Math.min(1, p.holder.position.x / (orbitCam.position.z * 0.9)));
    const rx = 0.3 * Math.max(-1, Math.min(1, p.holder.position.y / (orbitCam.position.z * 0.6)));
    p.card.rotation.y += (ry - p.card.rotation.y) * 0.1; p.card.rotation.x += (rx - p.card.rotation.x) * 0.1;
    // la vignette se décale du côté opposé au logo (jamais vers lui) : à gauche pour les pièces de gauche,
    // en bas pour celles du bas…
    const sx = Math.sign(p.holder.position.x) || 1, sy = Math.sign(p.holder.position.y) || 1;
    const o = orbitCam.aspect < 1 ? 0.25 : 1;          // téléphone : la vignette reste collée à sa pièce (sinon elle sort de l'écran)
    p.card.scale.setScalar(orbitCam.aspect < 1 ? 0.68 : 1);   // téléphone : vignettes plus petites (6 pièces sur un écran étroit)
    p.card.position.x += (sx * 0.45 * o - p.card.position.x) * 0.1; p.card.position.y += (sy * 0.3 * o - p.card.position.y) * 0.1; });
  if (labelPiece) { if (labelPiece !== hovered || orbitShown < 0.6) cardFor(null); else placeLabel(); }
  if (warp.mode) {                                  // transition en cours
    if (warp.mode !== 'hold') warp.k = Math.min(1, (performance.now() - warp.t0) / warp.dur);
    // le logo reste de face, il ne suit plus la souris : la caméra vise l'étoile puis passe au travers
    target.x = target.y = 0;                         // le logo revient de face en douceur (pas de saut)
    rig.rotation.x *= Math.exp(-dt * 14); rig.rotation.y *= Math.exp(-dt * 14);
    warp.amt = Math.min(1, Math.pow(warp.k, 1.6) * 1.25);    // déformation qui monte en s'approchant
    camera.fov = BASE_FOV + 38 * warp.amt; camera.updateProjectionMatrix();   // grand angle
    // un seul mouvement continu, sans arrêt à mi-course (avant : approche, pause, puis plongée) :
    // la caméra se centre sur l'étoile et plonge dedans ; vu de la caméra, le logo grossit de plus en plus
    // vite jusqu'à la traversée (vers 60 % du temps), puis la page occupe l'écran
    const ex = 1 - Math.pow(1 - Math.min(1, warp.k / 0.5), 3);
    camera.position.set(STAR.x * ex, STAR.y * ex, -0.35 + (camZ + 0.35) * Math.pow(1 - warp.k, 2.6));
    // la page du projet (chargée derrière) ne doit se voir que par l'étoile :
    //  · une plaque blanche percée de l'étoile, dans la scène 3D juste derrière le logo, cache la page
    //    partout dans le carré du logo sauf dans l'étoile (même déformation que le logo : rien ne dépasse) ;
    //  · hors du carré, la page est découpée un peu en retrait du bord : le logo recouvre ce bord.
    // Quand on traverse l'étoile, plaque et découpe s'effacent : la page occupe tout l'écran.
    const peek = document.querySelector('.warp-peek');
    if (peek) {
      const through = camera.position.z < size.z * s / 2 + 0.03;
      starPlate.visible = !through;
      if (through) peek.style.clipPath = 'none';
      else {
        camera.updateMatrixWorld(); pivot.updateMatrixWorld();
        const r = stageEl.getBoundingClientRect(), asp = r.width / r.height, kk = 0.55 * (warp.amt || 0);
        const hx = size.x * s / 2 * 0.94, hy = size.y * s / 2 * 0.94, zf = size.z * s / 2, v = new THREE.Vector3(), out = [];
        const edge = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
        for (let e = 0; e < 4; e++) for (let t = 0; t < 12; t++) {     // côtés subdivisés : ils se courbent avec la déformation
          const [ax, ay] = edge[e], [bx, by] = edge[(e + 1) % 4], f = t / 12;
          v.set(ax + (bx - ax) * f, ay + (by - ay) * f, zf).project(camera);
          const qx = v.x / 2, qy = v.y / 2; let px = qx, py = qy;
          for (let it = 0; it < 6; it++) { const r2 = (px * asp) ** 2 + py ** 2, g = 1 - kk * r2; if (g < 0.2) break; px = qx / g; py = qy / g; }
          out.push(`${(r.left + (px + 0.5) * r.width).toFixed(1)}px ${(r.top + (0.5 - py) * r.height).toFixed(1)}px`);
        }
        peek.style.clipPath = 'polygon(' + out.join(',') + ')';
      }
      peek.style.visibility = 'visible';
    }
    if (warp.k >= 1 && warp.mode !== 'hold') { const d = warp.done; if (warp.mode === 'out') stageEl.style.visibility = 'hidden';   // on est passé à travers : le logo ne revient pas
      warp.mode = null; warp.amt = 0; starPlate.visible = false;
      camera.fov = BASE_FOV; camera.updateProjectionMatrix(); camera.position.set(0, 0, camZ); d?.(); }
  } else camera.position.set(0, 0, camZ);
  if (warp.mode && warp.amt > 0.01 && !FLAT) {     // transition : rendu à travers l'« objectif »
    const L = lensPass(), size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (L.rt.width !== size.x || L.rt.height !== size.y) { L.rt.setSize(size.x, size.y); L.mat.uniforms.uAspect.value = size.x / size.y; }
    L.mat.uniforms.uAmt.value = warp.amt;
    renderer.setRenderTarget(L.rt); renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(L.sc, L.cam);
  } else if (!FLAT || IN_STAGE) renderer.render(scene, camera);
  if (orbitRenderer && (orbit.visible || orbitShown > 0)) {
    psy += ((psyOn ? 1 : 0) - psy) * (1 - Math.exp(-dt * 2.5));
    if (psy > 0.002) { kaleido().draw(t, Math.min(1, psy)); document.documentElement.style.setProperty('--psy', psy.toFixed(3)); }
    if (wide) { const u = wide.mat.uniforms; u.uPsy.value = psy; u.uT.value = t; u.uK.value = WIDE ? WIDE_K : 0; u.uCA.value = WIDE ? WIDE_CA : 0; }
    if (wideOn()) {
      const sz = orbitRenderer.getDrawingBufferSize(new THREE.Vector2());
      if (wide.rt.width !== sz.x || wide.rt.height !== sz.y) { wide.rt.setSize(sz.x, sz.y); wide.mat.uniforms.uAspect.value = sz.x / sz.y; }
      orbitRenderer.setRenderTarget(wide.rt); orbitRenderer.setClearColor(0x000000, 0); orbitRenderer.clear();
      orbitRenderer.render(orbitScene, orbitCam);
      orbitRenderer.setRenderTarget(null); orbitRenderer.render(wide.sc, wide.cam);
    } else orbitRenderer.render(orbitScene, orbitCam);
  }
  requestAnimationFrame(tick);
}
tick();
if (!FLAT) (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => {
  try {
    const L = lensPass(); starPlate.visible = true;
    renderer.compile(scene, camera); renderer.compile(L.sc, L.cam);
    renderer.setRenderTarget(L.rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
  } catch {} finally { starPlate.visible = false; }
}, { timeout: 3000 });
window.loadStep?.(1);     // première image affichée : la bobine se termine et s'efface
