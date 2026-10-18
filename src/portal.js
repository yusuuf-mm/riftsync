import * as THREE from 'three';
import { WORLDS, createPreviewScene } from './world.js';

// RIFTSYNC dimensional rift.
//
// The opening is a real hole into another world: a separate scene holding the
// destination environment is rendered into a WebGLRenderTarget and mapped onto
// an animated tear. An irregular, breathing boundary, chromatic displacement,
// a bright energy rim, orbiting fracture shards and inward-streaming particles
// give the portal physical presence. A local point light makes it illuminate
// the street around it.

const VERT = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uProgress;
  uniform vec3 uAccent;
  uniform vec3 uEdge;

  float boundary(float ang){
    float r = 1.0;
    r += 0.075 * sin(3.0 * ang + uTime * 1.25);
    r += 0.050 * sin(5.0 * ang - uTime * 1.85);
    r += 0.030 * sin(9.0 * ang + uTime * 2.60);
    r += 0.020 * sin(17.0 * ang - uTime * 3.10);
    return r;
  }

  void main(){
    vec2 uv = vUv * 2.0 - 1.0;
    float ang = atan(uv.y, uv.x);
    float r = length(uv);
    float edge = boundary(ang);
    float inside = smoothstep(edge, edge - 0.13, r);

    vec2 iuv = uv * 0.5 + 0.5;
    vec2 dir = r > 0.0001 ? uv / r : vec2(0.0);
    float warp = (0.4 + r) * 0.02 * inside;
    iuv += vec2(sin(uv.y * 9.0 + uTime * 2.1), cos(uv.x * 9.0 - uTime * 2.4)) * warp;
    float ca = (0.004 + 0.024 * r) * inside;
    vec3 img;
    img.r = texture2D(uTex, iuv + dir * ca).r;
    img.g = texture2D(uTex, iuv).g;
    img.b = texture2D(uTex, iuv - dir * ca).b;
    if (inside < 0.01) img = vec3(0.0);

    // energy threads swirling through the passage
    float swirl = 0.5 + 0.5 * sin(ang * 4.0 - uTime * 3.0 + r * 6.0);
    float pulse = 0.5 + 0.5 * sin(uTime * 7.0 - r * 12.0);
    vec3 energy = uAccent * (0.10 + 0.22 * swirl) * (0.35 + 0.65 * pulse) * inside;
    img += energy;

    // luminous rim
    float rim = smoothstep(edge - 0.34, edge, r) * (1.0 - smoothstep(edge, edge + 0.015, r));
    vec3 col = img + uEdge * rim * (2.2 + uProgress * 1.6);
    col += uAccent * smoothstep(edge - 0.9, edge - 0.3, r) * 0.12 * inside;

    float alpha = clamp(inside + rim * 1.3, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

function shardGeometry() {
  return new THREE.TetrahedronGeometry(1, 0);
}

export function createPortal(renderer) {
  const group = new THREE.Group();
  group.visible = false;
  const rt = new THREE.WebGLRenderTarget(560, 560, {
    depthBuffer: true,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.texture.generateMipmaps = false;

  const uniforms = {
    uTex: { value: rt.texture },
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uAccent: { value: new THREE.Color(WORLDS[0].accent) },
    uEdge: { value: new THREE.Color(0xffffff) }
  };
  const openingMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
  });
  const opening = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), openingMat);
  opening.scale.set(9.6, 13.4, 1);
  opening.position.y = 6.6;
  group.add(opening);

  // back plate so the world behind the tear reads dark, not showing the city through
  const backMat = new THREE.MeshBasicMaterial({ color: 0x05060a, transparent: true, opacity: 0.85, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backMat);
  back.scale.set(13, 17, 1);
  back.position.set(0, 6.6, 0.6);
  group.add(back);

  // orbiting fracture shards
  const shardMat = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.35, metalness: 0.7, emissive: 0x223044, emissiveIntensity: 0.6 });
  const shards = new THREE.InstancedMesh(shardGeometry(), shardMat, 26);
  shards.frustumCulled = false;
  group.add(shards);
  const shardData = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
    shardData.push({ a, rad: 5.0 + Math.random() * 2.4, s: 0.22 + Math.random() * 0.5, spin: (Math.random() - 0.5) * 2, y: 6.6 + (Math.random() - 0.5) * 8 });
  }

  // inward-streaming particles
  const P = 260;
  const ppos = new Float32Array(P * 3);
  const pseed = new Float32Array(P);
  for (let i = 0; i < P; i++) {
    pseed[i] = Math.random();
    const a = Math.random() * Math.PI * 2;
    const rad = 4 + Math.random() * 9;
    ppos[i * 3] = Math.cos(a) * rad;
    ppos[i * 3 + 1] = 6.6 + Math.sin(a) * rad * 1.2;
    ppos[i * 3 + 2] = (Math.random() - 0.5) * 6;
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  const pmat = new THREE.PointsMaterial({ size: 0.16, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const particles = new THREE.Points(pgeo, pmat);
  particles.frustumCulled = false;
  group.add(particles);

  // ground fracture lines racing toward the tear
  const fracMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const fracGroup = new THREE.Group();
  const fracs = [];
  for (let i = 0; i < 9; i++) {
    const len = 10 + Math.random() * 26;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.18 + Math.random() * 0.2, len), fracMat.clone());
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = (Math.random() - 0.5) * 0.5;
    const a = Math.random() * Math.PI;
    m.position.set(Math.cos(a) * (2 + Math.random() * 6), 0.03, 6 + Math.random() * 10);
    fracs.push({ mesh: m, phase: Math.random() });
    fracGroup.add(m);
  }
  group.add(fracGroup);

  const light = new THREE.PointLight(0xffffff, 0, 60, 2);
  light.position.set(0, 6, 1.5);
  group.add(light);

  const dummy = new THREE.Object3D();
  const previews = new Map();
  let destIndex = -1;
  let visible = false;
  let progress = 0;
  let flash = 0;

  function getPreview(index) {
    if (!previews.has(index)) previews.set(index, createPreviewScene(index));
    return previews.get(index);
  }

  function warm(index) { getPreview(index); }

  function setDestination(index) {
    if (index === destIndex) return;
    destIndex = index;
    const theme = WORLDS[index];
    uniforms.uAccent.value.setHex(theme.accent);
    uniforms.uEdge.value.setHex(theme.accent).lerp(new THREE.Color(0xffffff), 0.6);
    shardMat.emissive.setHex(theme.accent);
    pmat.color.setHex(theme.accent);
    fracMat.color.setHex(theme.accent);
    light.color.setHex(theme.accent);
    getPreview(index);
  }

  function update(dt, time, dtScale) {
    uniforms.uTime.value = time;
    uniforms.uProgress.value = progress;
    if (!visible) { light.intensity = 0; return; }

    // render destination world into the tear
    if (previews.has(destIndex)) {
      const preview = previews.get(destIndex);
      preview.update(dt);
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.render(preview.scene, preview.camera);
      renderer.setRenderTarget(prevTarget);
    }

    const s = 0.7 + progress * 0.45 + Math.sin(time * 2.0) * 0.015;
    opening.scale.set(9.6 * s, 13.4 * s, 1);
    opening.position.y = 6.6 * (1 + (s - 1) * 0.5);

    for (let i = 0; i < shardData.length; i++) {
      const d = shardData[i];
      const a = d.a + time * d.spin * 0.25 + progress * 0.4;
      const rad = d.rad * (1 + Math.sin(time * 1.4 + i) * 0.05);
      dummy.position.set(Math.cos(a) * rad, d.y + Math.sin(time * 0.9 + i * 1.3) * 0.4, Math.sin(a) * rad * 0.35);
      dummy.rotation.set(a * 1.3 + time, a * 0.7 - time * 0.6, a * 1.1 + time * 0.4);
      dummy.scale.setScalar(d.s * (0.8 + progress * 0.5));
      dummy.updateMatrix();
      shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;

    const arr = pgeo.attributes.position.array;
    for (let i = 0; i < P; i++) {
      const k = ((time * (0.4 + pseed[i] * 0.5) + pseed[i]) % 1);
      const pull = 1 - k;
      const a = pseed[i] * Math.PI * 2 + time * 0.4;
      const rad = 2 + pull * 9;
      arr[i * 3] = Math.cos(a) * rad * 0.9;
      arr[i * 3 + 1] = 6.6 + Math.sin(a) * rad * 1.15;
      arr[i * 3 + 2] = (pseed[i] - 0.5) * 5 * pull;
    }
    pgeo.attributes.position.needsUpdate = true;

    for (const f of fracs) {
      const p = (time * 0.8 + f.phase) % 1;
      f.mesh.material.opacity = (0.35 + 0.4 * progress) * Math.sin(p * Math.PI);
      f.mesh.scale.y = 0.6 + p * 0.8;
      f.mesh.position.z = 6 - progress * 4;
      f.mesh.position.x = Math.sin(f.phase * 6.28) * (3 + p * 3);
    }

    light.intensity = 55 * (0.5 + progress) * (flash > 0 ? 2.2 : 1);
    light.distance = 70;
    void dtScale;
  }

  return {
    group, setDestination, update, warm,
    get destination() { return destIndex; },
    show() { visible = true; group.visible = true; },
    hide() { visible = false; group.visible = false; light.intensity = 0; },
    setProgress(v) { progress = Math.max(0, Math.min(1.2, v)); },
    get progress() { return progress; },
    pulse() { flash = 0.4; },
    dispose() {
      group.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      openingMat.dispose(); backMat.dispose(); shardMat.dispose(); pmat.dispose(); pgeo.dispose(); fracMat.dispose();
      previews.forEach(p => p.dispose());
      rt.dispose();
    }
  };
}
