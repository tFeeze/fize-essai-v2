// Matières des pièces V2 (accueil 3D et page Finitions) : une fiche de models-v2.js → un matériau Three.js.
// argent, blanc-or (veines d'or), pla (stries de couches), bois, resine (mate), multi (couleurs par objet),
// cristal (résine transparente), laque (peint verni brillant).
export function finishMaterial(THREE, m) {
  const col = new THREE.Color(m.couleur);
  const P = { argent: { color: 0xdcdee3, metalness: 1, roughness: 0.14 },
              'blanc-or': { color: col, roughness: 0.25, clearcoat: 0.3 },
              pla: { color: col, roughness: 0.45, clearcoat: 0.15 },
              bois: { color: col, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.2 },
              resine: { color: col, roughness: 0.62 },
              laque: { color: col, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04 },
              multi: { color: 0xffffff, roughness: 0.4, clearcoat: 0.2, vertexColors: true },
              // résine transparente : presque invisible de face, la matière se lit sur les bords et dans les reflets
              cristal: { color: col, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2,
                transparent: true, depthWrite: false, side: THREE.DoubleSide } }[m.matiere] || { color: col };
  const mat = new THREE.MeshPhysicalMaterial(P);
  if (m.matiere === 'argent') { mat.envMapIntensity = 2.6; mat.color.set(0xeef0f4); }           // le métal vit de ses reflets
  if (m.matiere === 'cristal') {
    mat.customProgramCacheKey = () => 'cristal';
    mat.onBeforeCompile = sh => {            // opacité selon l'angle (Fresnel) : bords nets, face transparente
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        float fr = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.2);
        diffuseColor.a = mix(0.07, 0.62, fr);
        outgoingLight += vec3(0.9, 0.95, 1.0) * fr * 0.35;
        #include <opaque_fragment>`);
    };
    return mat;
  }
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
