import * as THREE from 'three';

function plateTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 512, 112);
  g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, 3, 506, 106);
  g.fillStyle = '#1a3d9c'; g.fillRect(6, 6, 76, 100);
  const fl = [['#239f40', 14], ['#ffffff', 28], ['#da0000', 42]];
  fl.forEach(([col, y]) => { g.fillStyle = col; g.fillRect(20, 12 + (y - 14) * 0.9, 48, 12); });
  g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center';
  g.fillText('I.R. IRAN', 44, 94);
  g.fillStyle = '#111'; g.font = 'bold 72px sans-serif'; g.textBaseline = 'middle';
  g.fillText('۱۲ ب ۳۴۵', 255, 58);
  g.fillText('۶۷', 450, 58);
  g.fillRect(380, 14, 3, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createPride(options = {}) {
  const color = options.color !== undefined ? options.color : 0xf2f2f2;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223344, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x555a5e, roughness: 0.6, metalness: 0.3 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xffffcc, emissiveIntensity: 0 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0xff0000, emissiveIntensity: 0.25 });
  const indMat = new THREE.MeshStandardMaterial({ color: 0xff9900, emissive: 0x442200, emissiveIntensity: 0.4 });

  const add = (geo, mat, x, y, z, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };

  // Body side profile (shape x = z-world, y = height), extruded across width
  const W = 1.6, L = 3.9;
  const s = new THREE.Shape();
  const z0 = -L / 2, z1 = L / 2;
  s.moveTo(z0, 0.28); s.lineTo(z0, 0.75); s.lineTo(z0 + 0.1, 0.88);
  s.lineTo(z0 + 0.55, 0.93); // trunk lid
  s.lineTo(z1 - 1.0, 0.95); // hood end near windshield base
  s.lineTo(z1 - 0.05, 0.82); s.lineTo(z1, 0.7); s.lineTo(z1, 0.28);
  s.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: W - 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  bodyGeo.translate(0, 0, -(W - 0.2) / 2);
  bodyGeo.rotateY(-Math.PI / 2); // shape x -> world z
  const body = add(bodyGeo, paint, 0, 0, 0);

  // Cabin
  const c = new THREE.Shape();
  c.moveTo(-1.25, 0); c.lineTo(-0.95, 0.5); c.lineTo(-0.7, 0.55);
  c.lineTo(0.35, 0.55); c.lineTo(0.85, 0.0); c.closePath();
  const cabGeo = new THREE.ExtrudeGeometry(c, { depth: W - 0.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  cabGeo.translate(0, 0, -(W - 0.3) / 2);
  cabGeo.rotateY(-Math.PI / 2);
  // cabin shape x spans -1.25..0.85 -> z; shift
  const cabin = add(cabGeo, glass, 0, 0.93, -0.1);
  cabin.castShadow = true;
  // roof panel and pillars (paint)
  add(new THREE.BoxGeometry(W - 0.25, 0.05, 1.1), paint, 0, 1.47, -0.275);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.52, 0.07), paint, sx * 0.66, 1.2, -0.3);
  }

  // Bumpers
  add(new THREE.BoxGeometry(W + 0.05, 0.2, 0.18), grey, 0, 0.38, 1.98);
  add(new THREE.BoxGeometry(W + 0.05, 0.2, 0.18), grey, 0, 0.38, -1.98);
  add(new THREE.BoxGeometry(0.9, 0.12, 0.04), black, 0, 0.55, 1.97); // grille
  add(new THREE.BoxGeometry(W, 0.03, 0.02), chrome, 0, 0.68, 1.97);

  // Lights
  const lights = [];
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.34, 0.14, 0.06), headMat, sx * 0.58, 0.68, 1.96);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.05), indMat, sx * 0.8 - sx * 0.0, 0.56, 1.96);
    add(new THREE.BoxGeometry(0.3, 0.16, 0.06), tailMat, sx * 0.62, 0.78, -1.97);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.05), indMat, sx * 0.62, 0.64, -1.98);
    const sp = new THREE.SpotLight(0xfff2cc, 0, 40, 0.5, 0.5, 1);
    sp.position.set(sx * 0.58, 0.7, 1.9);
    sp.target.position.set(sx * 0.58, 0.3, 12);
    sp.castShadow = false;
    group.add(sp, sp.target); lights.push(sp);
    // mirrors
    add(new THREE.BoxGeometry(0.16, 0.1, 0.08), paint, sx * 0.93, 1.1, 0.35);
    // door handles
    add(new THREE.BoxGeometry(0.03, 0.03, 0.12), chrome, sx * 0.82, 0.88, -0.3);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.12), chrome, sx * 0.82, 0.88, 0.5);
    // side trim
    add(new THREE.BoxGeometry(0.02, 0.05, 3.5), black, sx * 0.83, 0.52, 0);
  }

  // Plates
  const pt = plateTexture();
  const pm = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.5 });
  const pf = add(new THREE.PlaneGeometry(0.52, 0.113), pm, 0, 0.36, 2.075);
  const pr = add(new THREE.PlaneGeometry(0.52, 0.113), pm, 0, 0.6, -2.075);
  pr.rotation.y = Math.PI;

  // Wheels
  const R = 0.3, wb = 2.36, tw = 0.68;
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.4 });
  const makeWheel = () => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.19, 20), tireMat);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; w.add(tire);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 14), rimMat);
    cap.rotation.z = Math.PI / 2; w.add(cap);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), chrome);
    hub.rotation.z = Math.PI / 2; w.add(hub);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), black);
      b.rotation.x = i * Math.PI / 4; w.add(b);
    }
    return w;
  };
  const wheels = [], steerPivots = [];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, fz]) => {
    const w = makeWheel();
    if (fz > 0) {
      const p = new THREE.Object3D();
      p.position.set(sx * tw, R, wb / 2);
      p.add(w); group.add(p); steerPivots.push(p);
    } else {
      w.position.set(sx * tw, R, -wb / 2); group.add(w);
    }
    wheels.push(w);
  });
  // order: fl, fr, rl, rr
  group.traverse(o => { if (o.isMesh) o.castShadow = true; });

  return {
    group, wheels, steerPivots,
    setBrakeLights(on) { tailMat.emissiveIntensity = on ? 2.5 : 0.25; },
    setHeadlights(on) {
      headMat.emissiveIntensity = on ? 2 : 0;
      lights.forEach(l => { l.intensity = on ? 30 : 0; });
    },
    setColor(hex) { paint.color.set(hex); },
    dimensions: { length: 3.9, width: 1.6, height: 1.45, wheelRadius: 0.3, wheelBase: 2.36 }
  };
}
