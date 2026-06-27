import * as THREE from 'three';
import { PLANETS } from './planets.js';

export class PlanetSelectView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.z = 28;
    this.planets = [];
    this._hovered = null;

    this.scene.add(new THREE.AmbientLight(0x446688, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 3, 8);
    this.scene.add(sun);

    const count = PLANETS.length;
    PLANETS.forEach((p, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const radius = 9;
      const geo = new THREE.SphereGeometry(2.2 - i * 0.05, 48, 48);
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.85,
        metalness: 0.08,
        emissive: new THREE.Color(p.color).multiplyScalar(0.08)
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.cos(angle) * radius, Math.sin(i * 0.4) * 1.5, Math.sin(angle) * radius);
      mesh.userData.planetId = p.id;
      this.scene.add(mesh);
      this.planets.push({ mesh, data: p, angle, baseY: mesh.position.y });
    });

    const starGeo = new THREE.BufferGeometry();
    const n = 1200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120 - 30;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8 })));

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const meshes = this.planets.map((p) => p.mesh);
    const hits = ray.intersectObjects(meshes);
    return hits[0]?.object?.userData?.planetId || null;
  }

  setHover(id) {
    this._hovered = id;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(t) {
    this.planets.forEach((p, i) => {
      p.mesh.rotation.y = t * 0.15 + i;
      const hover = p.data.id === this._hovered;
      const scale = hover ? 1.18 : 1;
      p.mesh.scale.setScalar(scale);
      p.mesh.position.y = p.baseY + Math.sin(t * 0.8 + i) * 0.25 + (hover ? 0.4 : 0);
    });
    this.camera.position.x = Math.sin(t * 0.08) * 3;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}