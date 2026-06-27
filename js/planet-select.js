import * as THREE from 'three';
import { PLANETS } from './planets.js';
import { makePlanetTexture, observeCanvasResize, getParentSize } from './graphics-utils.js';

export class PlanetSelectView {
  constructor(canvas, onSelect) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this._hovered = null;
    this._featuredId = PLANETS[0].id;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040810);
    this.scene.fog = new THREE.FogExp2(0x040810, 0.012);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.camera.position.set(0, 2, 22);

    this._buildStars();
    this._buildLights();
    this.planets = this._buildPlanets();

    this._stopResize = observeCanvasResize(canvas.parentElement, () => this.resize());
  }

  _buildStars() {
    const geo = new THREE.BufferGeometry();
    const n = 2500;
    const pos = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 60 + Math.random() * 140;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const bright = 0.5 + Math.random() * 0.5;
      colors[i * 3] = bright;
      colors[i * 3 + 1] = bright;
      colors[i * 3 + 2] = bright * (0.85 + Math.random() * 0.15);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.2,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9
    })));
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x334466, 0.45));
    this.sun = new THREE.DirectionalLight(0xfff4e8, 1.5);
    this.sun.position.set(8, 4, 12);
    this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight(0x4488ff, 0.35);
    rim.position.set(-10, -2, -8);
    this.scene.add(rim);
  }

  _buildPlanets() {
    const group = new THREE.Group();
    this.scene.add(group);
    const entries = [];

    PLANETS.forEach((p, i) => {
      const angle = (i / PLANETS.length) * Math.PI * 2 - Math.PI / 2;
      const orbitR = 11;
      const radius = 1.6 - i * 0.04;
      const tex = makePlanetTexture(p);

      const geo = new THREE.SphereGeometry(radius, 64, 64);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.88,
        metalness: 0.06,
        emissive: new THREE.Color(p.color).multiplyScalar(0.04)
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(angle) * orbitR, Math.sin(i * 0.5) * 1.2, Math.sin(angle) * orbitR);
      mesh.userData.planetId = p.id;
      group.add(mesh);

      const atmo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.08, 32, 32),
        new THREE.MeshBasicMaterial({
          color: p.accent,
          transparent: true,
          opacity: 0.08 + Math.min(p.atmosphere, 2) * 0.06,
          side: THREE.BackSide
        })
      );
      atmo.position.copy(mesh.position);
      group.add(atmo);

      let ringMesh = null;
      if (p.hasRings) {
        ringMesh = new THREE.Mesh(
          new THREE.RingGeometry(radius * 1.4, radius * 2.1, 64),
          new THREE.MeshBasicMaterial({
            color: 0xccbbaa,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide
          })
        );
        ringMesh.rotation.x = Math.PI / 2.2;
        ringMesh.position.copy(mesh.position);
        group.add(ringMesh);
      }

      entries.push({ mesh, atmo, ring: ringMesh, data: p, angle, orbitR, radius, baseY: mesh.position.y });
    });

    this.orbitGroup = group;
    return entries;
  }

  setFeatured(id) {
    this._featuredId = id;
    this._hovered = id;
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const meshes = this.planets.map((p) => p.mesh);
    const hits = ray.intersectObjects(meshes);
    return hits[0]?.object?.userData?.planetId || null;
  }

  setHover(id) {
    this._hovered = id || this._featuredId;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const { w, h } = getParentSize(parent);
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(t) {
    const featured = this.planets.find((p) => p.data.id === (this._hovered || this._featuredId)) || this.planets[0];

    this.planets.forEach((p, i) => {
      const isFeatured = p.data.id === featured.data.id;
      const hover = p.data.id === this._hovered;
      p.mesh.rotation.y = t * 0.2 + i * 0.5;
      const scale = isFeatured ? 1.35 : hover ? 1.15 : 1;
      p.mesh.scale.setScalar(scale);
      const lift = isFeatured ? 1.2 : hover ? 0.5 : 0;
      p.mesh.position.y = p.baseY + Math.sin(t * 0.9 + i) * 0.2 + lift;
      p.atmo.position.copy(p.mesh.position);
      p.atmo.scale.copy(p.mesh.scale).multiplyScalar(1.08);
      if (p.ring) {
        p.ring.position.copy(p.mesh.position);
        p.ring.scale.copy(p.mesh.scale);
      }
      const emissive = isFeatured ? 0.12 : hover ? 0.08 : 0.04;
      p.mesh.material.emissive.set(new THREE.Color(p.data.color).multiplyScalar(emissive));
    });

    this.orbitGroup.rotation.y = t * 0.06;
    this.camera.position.x = Math.sin(t * 0.1) * 2.5;
    this.camera.position.y = 2 + Math.sin(t * 0.15) * 0.5;
    this.camera.lookAt(featured.mesh.position);
    this.sun.position.set(10 + Math.sin(t * 0.05) * 2, 5, 14);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._stopResize?.();
    this.renderer.dispose();
  }
}