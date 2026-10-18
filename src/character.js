import * as THREE from 'three';

// RIFTSYNC protagonist.
//
// A purpose-built rigged humanoid: a named bone hierarchy (pelvis -> spine ->
// chest -> neck/head, shoulders -> arms, hips -> legs) with sculpted body
// parts attached to each joint. Locomotion (run, idle, jump, land, slide, hit)
// is authored procedurally so foot cadence stays locked to run speed.
//
// The look is driven by the start.ng character `style` so the runner matches
// the player's character: body type, primary/secondary/skin/hair colours, hair
// style, hat and accessory.

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;

function toColor(value, fallback) {
  try {
    if (typeof value === 'string' && globalThis.CSS?.supports?.('color', value)) return new THREE.Color(value);
  } catch { /* ignore */ }
  return new THREE.Color(fallback);
}

function shade(color, amount) {
  const c = color.clone();
  if (amount >= 0) c.lerp(new THREE.Color(0xffffff), amount);
  else c.lerp(new THREE.Color(0x000000), -amount);
  return c;
}

export function createCharacter(initialStyle) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mats = {
    skin: new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.03, flatShading: false }),
    top: new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.1 }),
    jacket: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.16 }),
    bottom: new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 }),
    boot: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.3 }),
    hair: new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02 }),
    hat: new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15 }),
    trim: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.4, emissiveIntensity: 1.1, toneMapped: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.5, metalness: 0.25 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fd8e6, roughness: 0.12, metalness: 0.6, transparent: true, opacity: 0.5 }),
    accent: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 })
  };

  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 18, 14),
    rounded: new THREE.SphereGeometry(1, 16, 12),
    cone: new THREE.ConeGeometry(1, 1, 14),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
    torus: new THREE.TorusGeometry(1, 0.3, 8, 18)
  };

  function mesh(kind, material) {
    const m = new THREE.Mesh(geo[kind], material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function capsule(parent, mat, radius, length, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 12), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function box(parent, mat, sx, sy, sz, x = 0, y = 0, z = 0) {
    const m = mesh('box', mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function sphere(parent, mat, r, x = 0, y = 0, z = 0, sy = 1, sz = 1) {
    const m = mesh('sphere', mat);
    m.scale.set(r, r * sy, r * sz);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  // ---- skeleton ----------------------------------------------------------
  const B = {};
  function bone(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    B[name] = g;
    return g;
  }

  const HIP_Y = 0.95;
  bone('hips', body, 0, HIP_Y, 0);
  bone('spine', B.hips, 0, 0.02, 0);
  bone('chest', B.spine, 0, 0.2, 0);
  bone('neck', B.chest, 0, 0.26, 0);
  bone('head', B.neck, 0, 0.1, 0);
  bone('shoulderL', B.chest, -0.17, 0.2, 0);
  bone('elbowL', B.shoulderL, 0, -0.27, 0);
  bone('handL', B.elbowL, 0, -0.25, 0);
  bone('shoulderR', B.chest, 0.17, 0.2, 0);
  bone('elbowR', B.shoulderR, 0, -0.27, 0);
  bone('handR', B.elbowR, 0, -0.25, 0);
  bone('thighL', B.hips, -0.11, -0.04, 0);
  bone('kneeL', B.thighL, 0, -0.47, 0);
  bone('footL', B.kneeL, 0, -0.46, 0);
  bone('thighR', B.hips, 0.11, -0.04, 0);
  bone('kneeR', B.thighR, 0, -0.47, 0);
  bone('footR', B.kneeR, 0, -0.46, 0);

  // ---- body parts --------------------------------------------------------
  const parts = new THREE.Group();
  B.hips.add(parts);

  // pelvis + torso
  capsule(B.hips, mats.bottom, 0.13, 0.3, 0, 0.03, 0);
  const torso = new THREE.Group();
  B.chest.add(torso);
  capsule(B.spine, mats.top, 0.135, 0.3, 0, 0.1, 0);
  capsule(torso, mats.jacket, 0.155, 0.34, 0, 0.06, 0);
  // collar
  // collar
  const collar = mesh('cyl', mats.top);
  collar.scale.set(0.075, 0.05, 0.075);
  collar.position.set(0, 0.26, 0);
  torso.add(collar);
  // sync core emblem
  const core = box(torso, mats.trim, 0.05, 0.05, 0.015, 0, 0.1, -0.16);
  core.rotation.z = Math.PI / 4;
  // belt
  box(B.hips, mats.dark, 0.25, 0.06, 0.18, 0, -0.05, 0);

  // arms
  capsule(B.shoulderL, mats.jacket, 0.06, 0.27, 0, -0.13, 0);
  capsule(B.elbowL, mats.top, 0.052, 0.25, 0, -0.12, 0);
  box(B.handL, mats.dark, 0.08, 0.09, 0.09, 0, -0.04, 0);
  capsule(B.shoulderR, mats.jacket, 0.06, 0.27, 0, -0.13, 0);
  capsule(B.elbowR, mats.top, 0.052, 0.25, 0, -0.12, 0);
  box(B.handR, mats.dark, 0.08, 0.09, 0.09, 0, -0.04, 0);

  // legs
  capsule(B.thighL, mats.bottom, 0.075, 0.47, 0, -0.23, 0);
  capsule(B.kneeL, mats.bottom, 0.065, 0.46, 0, -0.23, 0);
  const bootL = new THREE.Group();
  B.footL.add(bootL);
  box(bootL, mats.boot, 0.1, 0.11, 0.12, 0, -0.05, 0);
  box(bootL, mats.boot, 0.095, 0.06, 0.2, 0, -0.08, -0.07);
  capsule(B.thighR, mats.bottom, 0.075, 0.47, 0, -0.23, 0);
  capsule(B.kneeR, mats.bottom, 0.065, 0.46, 0, -0.23, 0);
  const bootR = new THREE.Group();
  B.footR.add(bootR);
  box(bootR, mats.boot, 0.1, 0.11, 0.12, 0, -0.05, 0);
  box(bootR, mats.boot, 0.095, 0.06, 0.2, 0, -0.08, -0.07);

  // head
  capsule(B.neck, mats.skin, 0.05, 0.11, 0, -0.02, 0);
  const headMesh = new THREE.Group();
  B.head.add(headMesh);
  const skull = sphere(headMesh, mats.skin, 0.108, 0, 0.055, 0, 1.12, 1.0);
  sphere(headMesh, mats.skin, 0.095, 0, -0.01, 0, 0.8, 0.92); // jaw
  // ears
  sphere(headMesh, mats.skin, 0.024, -0.1, 0.03, 0.01, 1.25, 0.7);
  sphere(headMesh, mats.skin, 0.024, 0.1, 0.03, 0.01, 1.25, 0.7);
  // eyes / brows / mouth / nose
  sphere(headMesh, mats.dark, 0.013, -0.042, 0.062, -0.092);
  sphere(headMesh, mats.dark, 0.013, 0.042, 0.062, -0.092);
  const browL = box(headMesh, mats.hair, 0.034, 0.007, 0.012, -0.043, 0.085, -0.098);
  const browR = box(headMesh, mats.hair, 0.034, 0.007, 0.012, 0.043, 0.085, -0.098);
  browL.rotation.z = 0.08;
  browR.rotation.z = -0.08;
  box(headMesh, mats.dark, 0.05, 0.008, 0.01, 0, -0.028, -0.104); // mouth
  const nose = mesh('cone', mats.skin);
  nose.scale.set(0.016, 0.028, 0.016);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.028, -0.1);
  headMesh.add(nose);

  // ---- style layers (hair / hat / accessory) -----------------------------
  const styleLayer = new THREE.Group();
  B.head.add(styleLayer);

  function clearLayer(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse(o => {
        if (o.isMesh && !Object.values(geo).includes(o.geometry)) o.geometry.dispose();
      });
    }
  }

  function hair(style) {
    const kind = style.hair || 'short';
    const color = toColor(style.hairColor, '#181415');
    mats.hair.color.copy(color);
    const g = new THREE.Group();
    if (kind === 'bald') return g;
    // base cap for every non-bald style
    const cap = sphere(g, mats.hair, 0.116, 0, 0.075, 0.01, 0.9, 1.02);
    cap.scale.x *= style.body === 'female' ? 1.02 : 1;
    if (kind === 'short') {
      sphere(g, mats.hair, 0.1, 0, 0.1, 0.03, 0.8, 0.95);
    } else if (kind === 'afro') {
      sphere(g, mats.hair, 0.16, 0, 0.12, 0.02, 1.02, 1.02);
    } else if (kind === 'bun') {
      sphere(g, mats.hair, 0.075, 0, 0.16, 0.11, 1, 1);
    } else if (kind === 'ponytail') {
      const p = capsule(g, mats.hair, 0.045, 0.26, 0, 0.06, 0.14);
      p.rotation.x = -0.5;
    } else if (kind === 'braids' || kind === 'dreads') {
      const count = kind === 'braids' ? 8 : 10;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI - Math.PI / 2;
        const l = 0.18 + (i % 3) * 0.05;
        const strand = capsule(g, mats.hair, kind === 'braids' ? 0.016 : 0.013, l, Math.sin(a) * 0.1, 0.02 - l * 0.3, Math.cos(a) * 0.1 + 0.03);
        strand.rotation.x = 0.12;
      }
    }
    return g;
  }

  function hat(style) {
    const kind = style.hat || 'none';
    const g = new THREE.Group();
    const hatMat = mats.hat;
    const accentMat = mats.accent;
    if (kind === 'none') return g;
    if (kind === 'cap') {
      sphere(g, hatMat, 0.118, 0, 0.085, 0, 0.62, 1.0);
      box(g, hatMat, 0.17, 0.02, 0.13, 0, 0.075, -0.11);
    } else if (kind === 'beanie') {
      const b = sphere(g, hatMat, 0.122, 0, 0.085, 0, 0.72, 1.0);
      box(g, hatMat, 0.24, 0.03, 0.24, 0, 0.055, 0);
    } else if (kind === 'tophat') {
      box(g, hatMat, 0.26, 0.02, 0.26, 0, 0.09, 0);
      const cyl = mesh('cyl', hatMat);
      cyl.scale.set(0.1, 0.2, 0.1);
      cyl.position.set(0, 0.2, 0);
      g.add(cyl);
    } else if (kind === 'crown') {
      const ring = mesh('cyl', accentMat);
      ring.scale.set(0.11, 0.03, 0.11);
      ring.position.y = 0.11;
      g.add(ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = mesh('cone', accentMat);
        spike.scale.set(0.02, 0.07, 0.02);
        spike.position.set(Math.sin(a) * 0.1, 0.17, Math.cos(a) * 0.1);
        g.add(spike);
      }
    }
    return g;
  }

  function accessory(style) {
    const kind = style.accessory || 'none';
    const g = new THREE.Group();
    const dark = mats.dark;
    if (kind === 'none') return g;
    if (kind === 'glasses') {
      const r = mesh('torus', mats.glass);
      r.scale.set(0.038, 0.038, 0.03);
      r.position.set(-0.043, 0.062, -0.105);
      const r2 = r.clone();
      r2.position.x = 0.043;
      g.add(r, r2);
      box(g, dark, 0.03, 0.008, 0.01, 0, 0.062, -0.108);
      box(g, dark, 0.15, 0.008, 0.01, 0, 0.08, -0.04);
    } else if (kind === 'earrings') {
      sphere(g, mats.accent, 0.022, -0.105, 0.02, 0);
      sphere(g, mats.accent, 0.022, 0.105, 0.02, 0);
    } else if (kind === 'beard') {
      const skin = style.skinColor;
      mats.hair.color.copy(toColor(style.hairColor, '#181415'));
      const b = sphere(g, mats.hair, 0.1, 0, -0.01, -0.02, 0.8, 0.85);
      b.scale.z *= 0.9;
      void skin;
    } else if (kind === 'scarf') {
      const s = mesh('torus', mats.accent);
      s.scale.set(0.12, 0.12, 0.05);
      s.rotation.x = Math.PI / 2;
      s.position.y = 0.3;
      s.userData.carry = true;
      B.chest.add(s);
    } else if (kind === 'backpack') {
      const bp = new THREE.Group();
      bp.userData.carry = true;
      box(bp, mats.dark, 0.28, 0.3, 0.14, 0, 0.05, 0.16);
      box(bp, mats.trim, 0.05, 0.05, 0.02, 0, 0.12, 0.24);
      box(bp, mats.dark, 0.06, 0.26, 0.04, -0.11, 0.08, 0.1);
      box(bp, mats.dark, 0.06, 0.26, 0.04, 0.11, 0.08, 0.1);
      B.chest.add(bp);
      bp.traverse(o => { o.userData.carry = true; });
      return g;
    }
    return g;
  }

  function applyStyle(styleInput) {
    const style = styleInput && typeof styleInput === 'object' ? styleInput : {};
    const primary = toColor(style.primaryColor, '#3ea9c4');
    const secondary = toColor(style.secondaryColor, '#26303c');
    const skin = toColor(style.skinColor, '#c08a5e');
    const accent = toColor(style.hairColor, '#7fe3d0');

    mats.skin.color.copy(skin);
    mats.top.color.copy(shade(primary, -0.08));
    mats.jacket.color.copy(primary);
    mats.bottom.color.copy(secondary);
    mats.boot.color.copy(shade(secondary, -0.35));
    mats.trim.color.copy(primary);
    mats.trim.emissive.copy(shade(primary, 0.1));
    mats.accent.color.copy(shade(primary, 0.25));
    mats.accent.emissive = mats.accent.emissive || new THREE.Color();
    mats.accent.emissive.copy(shade(primary, 0.15));
    mats.accent.emissiveIntensity = 0.6;
    void accent;

    // remove old scarf/backpack attached to chest
    for (const c of [...B.chest.children]) {
      if (c.userData.carry) { B.chest.remove(c); }
    }

    clearLayer(styleLayer);
    styleLayer.add(hair(style));
    styleLayer.add(hat(style));
    const acc = accessory(style);
    acc.traverse(o => { o.userData.carry = true; });
    styleLayer.add(acc);

    const female = style.body === 'female';
    // body silhouette
    B.chest.scale.set(female ? 0.95 : 1.05, female ? 0.98 : 1.02, female ? 0.96 : 1);
    B.hips.scale.set(female ? 1.03 : 0.98, 1, 1);
    torso.scale.set(female ? 1 : 1.04, 1, female ? 0.98 : 1);
  }

  applyStyle(initialStyle);

  // ---- procedural animation ---------------------------------------------
  const state = { phase: 0, run: 0, blend: {}, mode: 'idle' };
  const target = {
    hipsY: 0, hipsRotX: 0, hipsRotZ: 0, spineRotX: 0, chestRotX: 0, chestRotZ: 0,
    thighL: 0, kneeL: 0, thighR: 0, kneeR: 0, footL: 0, footR: 0,
    armL: 0, elbowL: 0, armR: 0, elbowR: 0, headRotX: 0, headRotY: 0, bodyRotZ: 0
  };
  const eased = { ...target };

  function poseRun(t, speed) {
    const p = t;
    const stride = clamp(speed / 8.4, 0.7, 1.6);
    const amp = 0.72 * stride;
    target.thighL = Math.sin(p) * amp;
    target.thighR = Math.sin(p + Math.PI) * amp;
    target.kneeL = 0.35 + Math.max(0, -Math.sin(p + 0.9)) * 1.15;
    target.kneeR = 0.35 + Math.max(0, -Math.sin(p + Math.PI + 0.9)) * 1.15;
    target.footL = 0.2 + Math.sin(p + 1.6) * 0.25;
    target.footR = 0.2 + Math.sin(p + Math.PI + 1.6) * 0.25;
    target.armL = -Math.sin(p) * 0.62;
    target.armR = -Math.sin(p + Math.PI) * 0.62;
    target.elbowL = 1.0 + Math.sin(p) * 0.28;
    target.elbowR = 1.0 + Math.sin(p + Math.PI) * 0.28;
    target.hipsY = Math.abs(Math.sin(p)) * 0.045;
    target.spineRotX = 0.12 + speed * 0.012;
    target.chestRotX = 0.05;
    target.chestRotZ = Math.sin(p) * 0.06;
    target.hipsRotZ = Math.sin(p) * 0.05;
    target.headRotX = -0.06;
    target.armL += Math.sin(p) * 0; // keep
  }

  function poseIdle(t) {
    const s = Math.sin(t * 1.6);
    target.hipsY = s * 0.012;
    target.spineRotX = 0.03 + s * 0.02;
    target.chestRotX = 0.01;
    target.thighL = 0.02; target.thighR = 0.02;
    target.kneeL = 0.06; target.kneeR = 0.06;
    target.armL = 0.08 + s * 0.03; target.armR = 0.08 + s * 0.03;
    target.elbowL = 0.22; target.elbowR = 0.22;
    target.headRotX = s * 0.03;
    target.headRotY = Math.sin(t * 0.5) * 0.12;
  }

  function poseAction(action, u) {
    // u: 0 -> 1 progress through the action
    if (action === 'jump') {
      const rise = Math.sin(Math.min(1, u * 1.25) * Math.PI);
      target.thighL = -0.9 * rise + 0.1;
      target.thighR = -0.7 * rise - 0.15;
      target.kneeL = 0.6 + 0.9 * rise;
      target.kneeR = 0.9 + 0.6 * rise;
      target.armL = -1.5 * rise - 0.2;
      target.armR = -1.4 * rise - 0.2;
      target.elbowL = 0.5 + 0.4 * rise;
      target.elbowR = 0.5 + 0.4 * rise;
      target.spineRotX = 0.2 - 0.15 * rise;
      target.headRotX = -0.12 * rise;
      target.hipsY = 0.02;
    } else if (action === 'slide') {
      target.hipsY = -0.52;
      target.spineRotX = -0.7;
      target.chestRotX = -0.25;
      target.thighL = -1.35; target.thighR = -1.15;
      target.kneeL = 1.5; target.kneeR = 1.7;
      target.armL = -1.0; target.armR = -1.1;
      target.elbowL = 0.7; target.elbowR = 0.7;
      target.headRotX = 0.35;
    } else if (action === 'land') {
      const k = Math.sin(u * Math.PI);
      target.hipsY = -0.22 * k;
      target.thighL = -0.7 * k; target.thighR = -0.7 * k;
      target.kneeL = 0.4 + 1.0 * k; target.kneeR = 0.4 + 1.0 * k;
      target.spineRotX = 0.1 + 0.3 * k;
      target.armL = -0.5 * k; target.armR = -0.5 * k;
      target.elbowL = 0.6; target.elbowR = 0.6;
    }
  }

  function zeroTarget() {
    for (const k in target) target[k] = 0;
  }

  function update(dt, input = {}) {
    const mode = input.mode || (input.speed > 0.5 ? 'run' : 'idle');
    const speed = input.speed || 0;
    const time = input.time ?? 0;

    state.phase += dt * clamp(speed * 0.62, 0, 11) || dt * 1.2;

    zeroTarget();
    if (mode === 'run') poseRun(state.phase, speed);
    else if (mode === 'idle') poseIdle(time);
    else if (mode === 'jump') poseAction('jump', input.actionU ?? 0);
    else if (mode === 'slide') poseAction('slide', input.actionU ?? 0.5);
    else if (mode === 'land') poseAction('land', input.actionU ?? 0.5);

    // lane lean + hit reaction + turn
    target.bodyRotZ = -(input.roll || 0) * 0.28;
    const hit = input.hit || 0;
    if (hit > 0) {
      target.spineRotX += -0.35 * hit;
      target.headRotX += 0.3 * hit;
      target.armL += -0.5 * hit;
      target.armR += -0.5 * hit;
    }

    // smooth toward target
    const k = clamp(dt * 16, 0, 1);
    for (const key in eased) eased[key] = lerp(eased[key], target[key], k);

    // apply
    B.hips.position.y = HIP_Y + eased.hipsY;
    B.hips.rotation.z = eased.hipsRotZ;
    B.spine.rotation.x = eased.spineRotX;
    B.chest.rotation.x = eased.chestRotX;
    B.chest.rotation.z = eased.chestRotZ;
    body.rotation.z = eased.bodyRotZ;
    B.thighL.rotation.x = -eased.thighL;
    B.thighR.rotation.x = -eased.thighR;
    B.kneeL.rotation.x = eased.kneeL;
    B.kneeR.rotation.x = eased.kneeR;
    B.footL.rotation.x = -eased.footL;
    B.footR.rotation.x = -eased.footR;
    B.shoulderL.rotation.x = -eased.armL;
    B.shoulderR.rotation.x = -eased.armR;
    B.shoulderL.rotation.z = 0.08;
    B.shoulderR.rotation.z = -0.08;
    B.elbowL.rotation.x = -eased.elbowL;
    B.elbowR.rotation.x = -eased.elbowR;
    B.head.rotation.x = eased.headRotX;
    B.head.rotation.y = eased.headRotY;
  }

  // character faces -Z
  root.rotation.y = Math.PI;
  root.position.y = 0;

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 24),
    new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.02, 0);
  shadow.renderOrder = -1;

  function dispose() {
    root.traverse(o => {
      if (o.isMesh && !Object.values(geo).includes(o.geometry)) o.geometry.dispose();
    });
    for (const m of Object.values(mats)) m.dispose();
    shadow.geometry.dispose();
    shadow.material.dispose();
  }

  return { root, shadow, update, setStyle: applyStyle, dispose, height: 1.8 };
}
