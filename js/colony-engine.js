import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getPlanet } from './planets.js';
import { BUILDINGS } from './buildings.js';

const ROVER_URL = '/assets/mars-rover.glb';

export class ColonyEngine {
  constructor(canvas, planetId) {
    this.canvas = canvas;
    this.planet = getPlanet(planetId);
    this.buildingMeshes = new Map();
    this.truckMeshes = new Map();
    this.nodeMeshes = [];
    this._roverTemplate = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.planet.sky);
    this.scene.fog = new THREE.FogExp2(this.planet.fog, 0.004);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 800);
    this.camera.position.set(35, 42, 55);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 120;
    this.controls.target.set(0, 0, 0);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ground = null;
    this._buildWorld();
    this._buildLights();
    this._loadRover();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  _buildWorld() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 2000;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 200 + Math.random() * 300;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.4 + 80;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true }));
    this.scene.add(stars);

    const groundTex = this._makeTerrainTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.92,
      metalness: 0.05,
      color: new THREE.Color(this.planet.color)
    });
    this.groundMat = groundMat;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 64, 64), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(12, 48),
      new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.7, metalness: 0.3 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.04;
    this.scene.add(pad);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(11.5, 12.5, 64),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.scene.add(ring);
  }

  _makeTerrainTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const col = new THREE.Color(this.planet.color);
    const r = Math.floor(col.r * 255), g = Math.floor(col.g * 255), b = Math.floor(col.b * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const shade = Math.random() * 40 - 20;
      ctx.fillStyle = `rgb(${r + shade},${g + shade * 0.6},${b + shade * 0.4})`;
      ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    return tex;
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x334466, 0.5));
    const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    sun.position.set(60, 80, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);
    const fill = new THREE.HemisphereLight(0x88aacc, 0x221108, 0.45);
    this.scene.add(fill);
  }

  async _loadRover() {
    try {
      const gltf = await new Promise((res, rej) => new GLTFLoader().load(ROVER_URL, res, undefined, rej));
      this._roverTemplate = gltf.scene;
      this._roverTemplate.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      const box = new THREE.Box3().setFromObject(this._roverTemplate);
      const size = new THREE.Vector3();
      box.getSize(size);
      const s = 2.2 / Math.max(size.x, size.y, size.z);
      this._roverScale = s;
    } catch (e) {
      console.warn('Rover GLB fallback', e);
    }
  }

  _createBuildingMesh(type) {
    const grp = new THREE.Group();
    const accent = new THREE.Color(this.planet.accent);

    if (type === 'habitat') {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.75 })
      );
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.4, 1.2, 24),
        new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.6, metalness: 0.4 })
      );
      base.position.y = 0.6;
      dome.position.y = 1.2;
      grp.add(base, dome);
    } else if (type === 'solar') {
      for (let i = 0; i < 4; i++) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(3, 0.08, 1.2),
          new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.2, metalness: 0.8, emissive: 0x2244aa, emissiveIntensity: 0.15 })
        );
        panel.position.set((i - 1.5) * 1.6, 0.8, 0);
        panel.rotation.x = -0.4;
        grp.add(panel);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 }));
      pole.position.y = 0.4;
      grp.add(pole);
    } else if (type === 'mine') {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.8, 3.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8, metalness: 0.3 })
      );
      tower.position.y = 1.75;
      const drill = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 2, 8),
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.3, metalness: 0.7 })
      );
      drill.position.y = 3.8;
      grp.add(tower, drill);
    } else if (type === 'garage') {
      const bay = new THREE.Mesh(
        new THREE.BoxGeometry(5, 2.5, 4),
        new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.5, metalness: 0.5 })
      );
      bay.position.y = 1.25;
      const door = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 2),
        new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.2, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      door.position.set(0, 1.2, 2.01);
      grp.add(bay, door);
    } else if (type === 'terraform') {
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 2, 4, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a5a3a, emissive: 0x44ff88, emissiveIntensity: 0.25, metalness: 0.4 })
      );
      core.position.y = 2;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.5, 0.15, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 0.5 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 3.5;
      grp.add(core, ring);
    } else if (type === 'research') {
      const lab = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 2.8, 3.5),
        new THREE.MeshStandardMaterial({ color: 0x4a5a7a, roughness: 0.35, metalness: 0.55 })
      );
      lab.position.y = 1.4;
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xeeeeff, metalness: 0.8, roughness: 0.15 })
      );
      dish.position.y = 3.2;
      grp.add(lab, dish);
    } else {
      const depot = new THREE.Mesh(
        new THREE.BoxGeometry(4, 2, 4),
        new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.7, metalness: 0.35 })
      );
      depot.position.y = 1;
      grp.add(depot);
    }

    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return grp;
  }

  syncState(state) {
    const tf = state.terraform / 100;
    const barren = new THREE.Color(this.planet.color);
    const lush = new THREE.Color(0x3a6b3a);
    this.groundMat.color.copy(barren).lerp(lush, tf * 0.65);
    this.groundMat.emissive = new THREE.Color(0x000000);
    if (tf > 0.2) {
      this.groundMat.emissive.set(0x0a1a0a);
      this.groundMat.emissiveIntensity = tf * 0.15;
    }

    state.buildings.forEach((b) => {
      if (this.buildingMeshes.has(b.id)) return;
      const mesh = this._createBuildingMesh(b.type);
      mesh.position.set(b.x, 0, b.z);
      this.scene.add(mesh);
      this.buildingMeshes.set(b.id, mesh);
    });

    state.nodes.forEach((node, i) => {
      if (this.nodeMeshes[i]) {
        const m = this.nodeMeshes[i];
        const ratio = 1 - node.depleted / node.max;
        m.material.emissiveIntensity = 0.2 + ratio * 0.4;
        m.scale.setScalar(0.5 + ratio * 0.5);
        return;
      }
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.2, 0),
        new THREE.MeshStandardMaterial({
          color: 0xffaa44,
          emissive: 0xff6600,
          emissiveIntensity: 0.5,
          metalness: 0.6,
          roughness: 0.2
        })
      );
      crystal.position.set(node.x, 1.2, node.z);
      crystal.castShadow = true;
      this.scene.add(crystal);
      this.nodeMeshes[i] = crystal;
    });

    state.trucks.forEach((truck) => {
      let mesh = this.truckMeshes.get(truck.id);
      if (!mesh) {
        if (this._roverTemplate) {
          mesh = this._roverTemplate.clone(true);
          mesh.scale.setScalar(this._roverScale || 1);
        } else {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, 1, 2.8),
            new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.6, roughness: 0.3 })
          );
        }
        this.scene.add(mesh);
        this.truckMeshes.set(truck.id, mesh);
      }
      mesh.position.set(truck.x, 0.3, truck.z);
      mesh.rotation.y = truck.t || 0;
    });
  }

  pickGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.ground);
    if (!hits.length) return null;
    const p = hits[0].point;
    if (Math.hypot(p.x, p.z) < 10) return null;
    return { x: p.x, z: p.z };
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w < 1 || h < 1) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}