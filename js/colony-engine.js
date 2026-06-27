import * as THREE from 'three';
import { MOUSE } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getPlanet } from './planets.js';
import { makeHeightmap, makeTerrainTexture, observeCanvasResize } from './graphics-utils.js';

const ROVER_URL = '/assets/mars-rover.glb';

export class ColonyEngine {
  constructor(canvas, planetId) {
    this.canvas = canvas;
    this.planet = getPlanet(planetId);
    this.buildingMeshes = new Map();
    this.truckMeshes = new Map();
    this.nodeMeshes = [];
    this._roverTemplate = null;
    this.stormIntensity = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.planet.sky);
    this.scene.fog = new THREE.FogExp2(this.planet.fog, 0.0035);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 800);
    this.camera.position.set(28, 34, 48);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 130;
    this.controls.target.set(0, 1, 0);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._buildSky();
    this._buildWorld();
    this._buildLights();
    this._buildDust();
    this._buildPreviewRing();
    this._loadRover();

    this._stopResize = observeCanvasResize(canvas.parentElement, () => this.resize());
    this.setBuildMode(false);
  }

  setBuildMode(active) {
    this._buildMode = active;
    if (active) {
      this.controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
      this.controls.enablePan = true;
    } else {
      this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    }
  }

  _buildPreviewRing() {
    this.previewRing = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    this.previewRing.rotation.x = -Math.PI / 2;
    this.previewRing.visible = false;
    this.scene.add(this.previewRing);
  }

  setBuildPreview(buildType, clientX, clientY) {
    if (!this.previewRing) return;
    if (!buildType || clientX == null) {
      this.previewRing.visible = false;
      return;
    }
    const pos = this.pickGround(clientX, clientY);
    if (!pos) {
      this.previewRing.visible = false;
      return;
    }
    const y = this._terrainHeight(pos.x, pos.z) + 0.2;
    this.previewRing.position.set(pos.x, y, pos.z);
    this.previewRing.visible = true;
    this.previewRing.material.color.set(0x00e5ff);
  }

  _buildSky() {
    const skyGeo = new THREE.SphereGeometry(380, 32, 16);
    const top = new THREE.Color(this.planet.skyTop || this.planet.sky);
    const bottom = new THREE.Color(this.planet.fog);
    const skyMat = new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      vertexColors: true
    });
    const colors = [];
    const verts = skyGeo.attributes.position;
    for (let i = 0; i < verts.count; i++) {
      const y = verts.getY(i);
      const t = Math.max(0, (y + 80) / 160);
      const c = bottom.clone().lerp(top, t);
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  _buildWorld() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1800;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 180 + Math.random() * 200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.35 + 100;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: true })));

    const hm = makeHeightmap(this.planet);
    const segments = 128;
    const geo = new THREE.PlaneGeometry(200, 200, segments, segments);
    const verts = geo.attributes.position;
    for (let i = 0; i < verts.count; i++) {
      const ix = i % (segments + 1);
      const iy = Math.floor(i / (segments + 1));
      const hx = Math.floor((ix / segments) * (hm.size - 1));
      const hy = Math.floor((iy / segments) * (hm.size - 1));
      verts.setY(i, hm.data[hy * hm.size + hx] * 5);
    }
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    const groundTex = makeTerrainTexture(this.planet);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.04,
      color: new THREE.Color(this.planet.color)
    });
    this.groundMat = groundMat;
    this.ground = new THREE.Mesh(geo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Flat invisible plane — reliable click-to-build raycasting
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.pickPlane.position.y = 0.08;
    this.scene.add(this.pickPlane);

    const zoneMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
    [15, 22, 30].forEach((r) => {
      const zone = new THREE.Mesh(new THREE.RingGeometry(r - 0.3, r + 0.3, 64), zoneMat);
      zone.rotation.x = -Math.PI / 2;
      zone.position.y = 0.1;
      this.scene.add(zone);
    });

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(11, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.65, metalness: 0.35, emissive: 0x112233, emissiveIntensity: 0.15 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.12;
    this.scene.add(pad);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(10.5, 11.5, 64),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.18;
    this.scene.add(ring);
  }

  _buildLights() {
    this.ambient = new THREE.AmbientLight(0x445566, 0.55);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffeedd, 1.5);
    this.sun.position.set(55, 75, 35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0x88aacc, 0x221108, 0.5));
  }

  _buildDust() {
    const count = 600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 8 + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: new THREE.Color(this.planet.color).lerp(new THREE.Color(0xaaaaaa), 0.5),
      size: 0.6,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.scene.add(this.dust);
  }

  setStormIntensity(v) {
    this.stormIntensity = Math.max(0, Math.min(1, v));
    this.dustMat.opacity = this.stormIntensity * 0.55;
    this.scene.fog.density = 0.0035 + this.stormIntensity * 0.012;
    this.sun.intensity = 1.5 * (1 - this.stormIntensity * 0.55);
    this.ambient.intensity = 0.55 * (1 - this.stormIntensity * 0.3);
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
      this._roverScale = 2.2 / Math.max(size.x, size.y, size.z);
    } catch (e) {
      console.warn('Rover GLB fallback', e);
    }
  }

  _terrainHeight(x, z) {
    if (!this.ground) return 0;
    const geo = this.ground.geometry;
    const segments = 128;
    const half = 100;
    const u = (x + half) / 200;
    const v = (z + half) / 200;
    const ix = Math.floor(u * segments);
    const iy = Math.floor(v * segments);
    const idx = iy * (segments + 1) + ix;
    const verts = geo.attributes.position;
    if (idx >= verts.count) return 0;
    return verts.getY(idx);
  }

  _createBuildingMesh(type) {
    const grp = new THREE.Group();
    const accent = new THREE.Color(this.planet.accent);

    if (type === 'habitat') {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.78 })
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
          new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.2, metalness: 0.8, emissive: 0x2244aa, emissiveIntensity: 0.2 })
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
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35, metalness: 0.7 })
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
        new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
      );
      door.position.set(0, 1.2, 2.01);
      grp.add(bay, door);
    } else if (type === 'terraform') {
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 2, 4, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a5a3a, emissive: 0x44ff88, emissiveIntensity: 0.3, metalness: 0.4 })
      );
      core.position.y = 2;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.5, 0.15, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 0.55 })
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
    const lush = new THREE.Color(0x3a7a3a);
    this.groundMat.color.copy(barren).lerp(lush, tf * 0.7);
    if (tf > 0.15) {
      this.groundMat.emissive = new THREE.Color(0x0a1a0a);
      this.groundMat.emissiveIntensity = tf * 0.18;
    }

    const storm = state.activeEvent?.type === 'dust_storm' ? (state.activeEvent.intensity || 0.5) : 0;
    this.setStormIntensity(storm);

    state.buildings.forEach((b) => {
      if (this.buildingMeshes.has(b.id)) return;
      const mesh = this._createBuildingMesh(b.type);
      const y = this._terrainHeight(b.x, b.z);
      mesh.position.set(b.x, y, b.z);
      this.scene.add(mesh);
      this.buildingMeshes.set(b.id, mesh);
    });

    state.nodes.forEach((node, i) => {
      if (this.nodeMeshes[i]) {
        const m = this.nodeMeshes[i];
        const ratio = 1 - node.depleted / node.max;
        m.material.emissiveIntensity = 0.25 + ratio * 0.45;
        m.scale.setScalar(0.5 + ratio * 0.5);
        return;
      }
      const y = this._terrainHeight(node.x, node.z);
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.2, 0),
        new THREE.MeshStandardMaterial({
          color: 0xffaa44,
          emissive: 0xff6600,
          emissiveIntensity: 0.55,
          metalness: 0.6,
          roughness: 0.2
        })
      );
      crystal.position.set(node.x, y + 1.4, node.z);
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
      const y = this._terrainHeight(truck.x, truck.z);
      mesh.position.set(truck.x, y + 0.35, truck.z);
      mesh.rotation.y = truck.t || 0;
    });
  }

  pickGround(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1) return null;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = [this.pickPlane, this.ground].filter(Boolean);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    const p = hits[0].point;
    const dist = Math.hypot(p.x, p.z);
    if (dist < 8) return null;
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

  render(t = 0) {
    if (this.dust && this.stormIntensity > 0.05) {
      const pos = this.dust.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + Math.sin(t + i) * 0.04 * this.stormIntensity);
        pos.setZ(i, pos.getZ(i) + Math.cos(t * 0.7 + i) * 0.03 * this.stormIntensity);
      }
      pos.needsUpdate = true;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._stopResize?.();
    this.renderer.dispose();
  }
}