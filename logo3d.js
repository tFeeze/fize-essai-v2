import * as THREE from 'three';
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
// Studio : bandes lumineuses sur fond sombre → reflets contrastés pour le chrome et le vernis
function studio() {
  const env = new THREE.Scene();
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#9a9a9a'); grad.addColorStop(0.45, '#444');
  grad.addColorStop(0.52, '#080808'); grad.addColorStop(0.7, '#2a2a2a'); grad.addColorStop(1, '#777');
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
scene.environment = pmrem.fromScene(studio(), 0.02).texture;

const BASE_FOV = 30;
const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.01, 100);   // plan proche très court : la caméra traverse l'étoile sans couper le logo
const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 4, 6); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-4, -1, 3); scene.add(fill);

// rig = ce qui suit la souris et pivote pendant les transformations
const rig = new THREE.Group(); scene.add(rig);

const U = { uTime: { value: 0 } };

// ── Logo ──────────────────────────────────────────────
const pivot = new THREE.Group(); rig.add(pivot);
const obj = FLAT ? new THREE.Group() : new OBJLoader().parse(window.LOGO_OBJ);   // modèle non chargé sur téléphone
const box = new THREE.Box3().setFromObject(obj);
const size = FLAT ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
const center = FLAT ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
const s = 1 / Math.max(size.x, size.y);

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
  const sx = 0.0766 / s, sy = 0.0282 / s;                       // centre de l'étoile (unités du modèle)
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
const WIDE = !!orbitRenderer, WIDE_K = TOUCH ? 0.55 : 0.85, WIDE_CA = 0.0012;   // ordinateur : grand angle plus marqué   // grand angle sur les pièces, ordinateur et téléphone
let wide = null;
if (WIDE) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uAspect: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uAspect; varying vec2 vUv;
      // distance au centre mesurée en fraction du cadre (pas en pixels) : l'effet est aussi fort en largeur
      // qu'en hauteur, que l'écran soit en paysage (ordinateur) ou en portrait (téléphone)
      vec2 bend(vec2 c) { return c * (1.0 - ${WIDE_K.toFixed(3)} * dot(c, c)) + 0.5; }
      void main() {
        vec2 c = vUv - 0.5; float e = dot(c, c) * ${WIDE_CA.toFixed(4)} * 8.0;
        vec4 g = texture2D(tDiffuse, bend(c));
        vec4 r = texture2D(tDiffuse, bend(c * (1.0 - e)));
        vec4 b = texture2D(tDiffuse, bend(c * (1.0 + e)));
        gl_FragColor = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(q);
  wide = { rt, mat, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}
// un point de l'écran → l'endroit correspondant de l'image non déformée (pour viser les pièces)
const unwide = (nx, ny, asp) => {
  if (!wide) return [nx, ny];
  const cx = nx / 2, cy = ny / 2, f = 1 - WIDE_K * (cx * cx + cy * cy);
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
function finishMaterial(m) {
  const col = new THREE.Color(m.couleur);
  const P = { argent: { color: 0xdcdee3, metalness: 1, roughness: 0.14 },
              'blanc-or': { color: col, roughness: 0.25, clearcoat: 0.3 },
              pla: { color: col, roughness: 0.45, clearcoat: 0.15 },
              bois: { color: col, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.2 },
              resine: { color: col, roughness: 0.62 },
              multi: { color: 0xffffff, roughness: 0.4, clearcoat: 0.2, vertexColors: true } }[m.matiere] || { color: col };
  const mat = new THREE.MeshPhysicalMaterial(P);
  if (m.matiere === 'argent') { mat.envMapIntensity = 2.6; mat.color.set(0xeef0f4); }           // le métal vit de ses reflets
  const kind = { 'blanc-or': 1, pla: 2, bois: 3 }[m.matiere] || 0;
  if (!kind) return mat;
  // période des stries d'impression : 0,2 mm réels, sur une pièce qui mesure 2 unités
  const per = 2 * 0.2 / Math.max(1, m.reel);
  mat.customProgramCacheKey = () => m.matiere + ':' + per.toFixed(6) + ':' + (m.axe || 'z');   // un programme par matière
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = position;');
    sh.fragmentShader = `varying vec3 vObj;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vnoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float edge(vec3 p) {                         // distance au bord de cellule (veines d'or)
        vec3 c = floor(p); float d1 = 9.0, d2 = 9.0;
        for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
          vec3 cc = c + vec3(x, y, z), q = cc + vec3(h3(cc), h3(cc + 3.1), h3(cc + 7.7));
          float d = length(p - q); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
        return d2 - d1; }
      ` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float vein = 0.0;
        ${kind === 1 ? `vec3 wp = vObj * 1.6 + (vec3(vnoise(vObj * 3.0), vnoise(vObj * 3.0 + 9.0), vnoise(vObj * 3.0 + 17.0)) - 0.5) * 0.35;
          vein = 1.0 - smoothstep(0.0, 0.05, edge(wp));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.83, 0.62, 0.22), vein);` : ''}
        ${kind === 3 ? `float g = vnoise(vec3(vObj.x * 6.0, vObj.y * 0.6, vObj.z * 6.0) + vnoise(vObj * 4.0) * 1.5);
          diffuseColor.rgb *= 0.78 + 0.32 * g;` : ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        ${kind === 1 ? 'metalnessFactor = mix(metalnessFactor, 1.0, vein);' : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        ${kind === 1 ? 'roughnessFactor = mix(roughnessFactor, 0.18, vein);' : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${kind === 2 ? `// stries de couches, atténuées quand elles deviennent plus fines qu'un pixel (pas de moiré)
          float ly = vObj.${m.axe || 'z'} / ${per.toFixed(6)} * 6.2832;
          float fw = fwidth(ly); float amp = 0.35 * clamp(1.0 - fw / 3.0, 0.0, 1.0);
          float hh = sin(ly) * amp * ${per.toFixed(6)} * 0.25;          // relief de la strie
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);   // bump à partir des dérivées écran
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dFdx(hh) * r1 + dFdy(hh) * r2);
          normal = normalize(abs(det) * normal - grad);` : ''}`);
  };
  return mat;
}
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
      dots = filament(geo, mat.color, pu); dots.visible = PRINT; mesh.add(dots);
    }
    const holder = new THREE.Group(); holder.add(mesh); orbit.add(holder);
    // zone de survol invisible, une sphère un peu plus large que la pièce : pas de « trou » où le survol décroche
    geo.computeBoundingSphere();
    const hit = new THREE.Mesh(new THREE.SphereGeometry(geo.boundingSphere.radius * 1.05, 16, 12),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    holder.add(hit);
    mesh.rotation.set(0, flatPic ? 0 : Math.random() * 6, 0);   // debout, dans son bon sens : seul le cap de départ change
    pieces.push({ pu, dots, build: 0, holder, mesh, hit, slug: m.slug, phase: i * 1.7, spin: (i % 2 ? -1 : 1) * (0.25 + 0.1 * i), grow: 1, lx: 0, ly: 0, mat, flat: flatPic, finish: !!m.matiere, rest: flatPic ? new THREE.Color('#ffffff') : STUDIO === 'gomme' ? gum(COLORS[i % COLORS.length]) : STUDIO ? bright(COLORS[i % COLORS.length]) : NEUTRAL,
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
  const h = ray.intersectObjects(pieces.map(p => p.hit))[0];
  return h ? pieces.find(p => p.hit === h.object) : null;
}
// affiche (ou masque) la fiche du projet ; place(w, h) renvoie sa position une fois sa taille connue
function showTip(pr, place) {
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
  const hit = pick(e.clientX, e.clientY, e.target);
  const pr = hit && projectOf(hit.slug);
  hovered = hit;                                  // grossit au survol, même sans projet lié
  document.body.style.cursor = pr ? 'pointer' : '';   // main sur une pièce liée à un projet
  // près d'un bord, l'étiquette passe de l'autre côté du curseur pour rester à l'écran
  showTip(pr, (tw, th) => [
    e.clientX + 18 + tw > innerWidth - 8 ? e.clientX - 18 - tw : e.clientX + 18,
    e.clientY + 14 + th > innerHeight - 8 ? e.clientY - 14 - th : e.clientY + 14]);
});
addEventListener('click', e => {
  if (e.pointerType && e.pointerType !== 'mouse') return;   // le doigt est géré plus bas
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
const SLOTS_WIDE = [[-0.58, 0.36], [0.6, 0.44], [-0.66, -0.4], [0.56, -0.46], [-0.08, -0.78], [0.2, 0.78], [-0.38, -0.74], [0.34, -0.76]];
const SLOTS_TALL = [[-0.48, 0.62], [0.5, 0.6], [-0.78, 0.02], [0.78, -0.02], [-0.48, -0.62], [0.5, -0.64]];   // téléphone : 6 pièces (2 au-dessus, 2 de côté, 2 en dessous)

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
const STAR = new THREE.Vector3(0.0766, 0.0282, 0);   // centre de l'étoile (repère du logo, qui mesure 1)
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
const wEase = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const coverZ = () => {                              // distance où le logo carré couvre tout l'écran
  const t = 2 * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
  return Math.min(0.97 / (t * camera.aspect), 0.95 / t) * 0.92;
};
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
      const reach = s * p.radius * Math.max(p.grow, 1.3);        // rayon à l'écran, y compris agrandie au survol
      const hw = w / 2 * persp, hh = h / 2 * persp;               // demi-largeur / demi-hauteur visibles à cette profondeur
      // position voulue (emplacement + flottement + suivi de la souris)…
      let x = sx * hw - p.lx * z * 0.6 + p.lx * 0.25;
      let y = sy * hh + Math.sin(t * 0.9 + p.phase) * 0.05 * h / 4 + p.ly * z * 0.6 - p.ly * 0.25;
      // …bornée pour que la pièce entière, même en tournant, reste dans le cadre (marge de 3 %)
      const edge = wide ? 0.97 * (1 - WIDE_K * 0.3) : 0.97;            // le grand angle repousse les bords : on garde la marge
      const mx = Math.max(0, hw * edge - reach), my = Math.max(0, hh * edge - reach);
      x = Math.min(mx, Math.max(-mx, x));
      const top = tall ? Math.max(0, hh * 0.87 * (wide ? 1 - WIDE_K * 0.3 : 1) - reach) : my;   // téléphone : on reste sous la barre de menu
      const bottom = tall ? Math.max(0, hh * 0.8 * (wide ? 1 - WIDE_K * 0.3 : 1) - reach) : my;  // …et au-dessus de la barre de Safari en bas
      y = Math.min(top, Math.max(-bottom, y));
      p.holder.position.set(x, y + fly, z);                        // l'envol au scroll, lui, peut sortir par le haut
      p.holder.rotation.set(p.ly * 0.5, p.lx * 0.5, 0);
      p.grow += ((p === hovered ? 1.3 : 1) - p.grow) * (1 - Math.exp(-dt * 10));
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
      else p.mesh.rotation.y += dt * p.spin * 0.6 * (p === hovered ? 2.5 : 1);
      p.mesh.rotation.x = Math.sin(t * 0.7 + p.phase) * 0.08 + gone * gone * 1.2 * Math.sign(p.spin);
      p.mesh.rotation.z = Math.sin(t * 0.55 + p.phase * 1.3) * 0.1 + gone * gone * 0.8 * p.spin;
    });

  }
  if (warp.mode) {                                  // transition en cours
    if (warp.mode !== 'hold') warp.k = Math.min(1, (performance.now() - warp.t0) / warp.dur);
    const cz = coverZ();
    // le logo reste de face, il ne suit plus la souris : la caméra vise l'étoile puis passe au travers
    rig.rotation.set(0, 0, 0); target.x = target.y = 0;
    const k1 = Math.min(1, warp.k / 0.6), k2 = Math.max(0, (warp.k - 0.6) / 0.4);
    warp.amt = Math.min(1, Math.pow(warp.k, 1.6) * 1.25);    // déformation qui monte en s'approchant
    camera.fov = BASE_FOV + 38 * warp.amt; camera.updateProjectionMatrix();   // grand angle
    const e = wEase(k1);
    camera.position.set(STAR.x * e, STAR.y * e, camZ + (cz - camZ) * e + (-0.35 - cz) * Math.pow(k2, 2));
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
    if (wide) {
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
