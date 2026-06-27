import * as THREE from 'three';
import { MOUSE } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { getPlanet } from './planets.js?v=18';
import {
  makeHeightmap, makeTerrainTexture, observeCanvasResize, getParentSize,
  initWebGLRenderer, pointerLockSupported
} from './graphics-utils.js?v=18';

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
    this.viewMode = 'orbit';
    this.keys = {};
    this.mobileMove = { x: 0, y: 0 };
    this.mobileLook = { x: 0, y: 0 };
    this._fpsYaw = 0;
    this._fpsPitch = 0;
    this._lastTf = -1;

    const gpu = initWebGLRenderer(canvas);
    if (!gpu.renderer) throw new Error('WebGL unavailable');
    this._mobileGPU = gpu.mobile;
    this.renderer = gpu.renderer;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.planet.sky);
    this.scene.fog = new THREE.FogExp2(this.planet.fog, 0.0035);
    this._barrenColor = new THREE.Color(this.planet.color);
    this._lushColor = new THREE.Color(0x3d8a3d);
    this._skyBarren = new THREE.Color(this.planet.sky);
    this._skyLush = new THREE.Color(0x6ab8e8);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 800);
    this.camera.position.set(28, 34, 48);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 130;
    this.controls.target.set(0, 1, 0);

    this.fpsPivot = new THREE.Object3D();
    this.fpsPivot.position.set(0, 2.4, 18);
    this.scene.add(this.fpsPivot);
    this.fpsPivot.add(this.camera);
    this.camera.position.set(0, 0, 0);

    this.pointerLock = null;
    if (pointerLockSupported()) {
      try {
        this.pointerLock = new PointerLockControls(this.fpsPivot, canvas);
      } catch (_) {
        this.pointerLock = null;
      }
    }

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._buildSky();
    this._buildWorld();
    this._buildVegetation();
    this._buildWater();
    this._buildOrbitPaths();
    this._buildLights();
    this._buildDust();
    this._buildPreviewRing();
    this._loadRover();

    this._orbitCamPos = new THREE.Vector3(28, 34, 48);
    this._orbitTarget = new THREE.Vector3(0, 1, 0);
    this.camera.removeFromParent();
    this.scene.add(this.camera);
    this.camera.position.copy(this._orbitCamPos);

    const resizeRoot = canvas.parentElement?.closest('#colony-screen') || canvas.parentElement;
    this._stopResize = observeCanvasResize(resizeRoot, () => this.resize());
    this.setBuildMode(false);
    this.setViewMode('orbit');
  }

  setBuildMode(active) {
    this._buildMode = active;
    if (this.viewMode === 'orbit') {
      if (active) {
        this.controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
      } else {
        this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
      }
    }
  }

  _releasePointerLock() {
    if (!this.pointerLock || !pointerLockSupported()) return;
    try { this.pointerLock.unlock(); } catch (_) { /* iOS */ }
  }

  setViewMode(mode) {
    const wasFps = this.viewMode === 'fps';
    this.viewMode = mode;
    if (mode === 'fps') {
      this.controls.enabled = false;
      this.setBuildMode(false);
      const pos = this.camera.position.clone();
      this.camera.removeFromParent();
      this.fpsPivot.add(this.camera);
      this.camera.position.set(0, 0, 0);
      this.fpsPivot.position.set(pos.x, 2.4, pos.z);
      this._fpsYaw = Math.atan2(-pos.x, -pos.z);
      this._fpsPitch = 0;
      this.fpsPivot.rotation.set(0, this._fpsYaw, 0);
      this.canvas.classList.add('fps-mode');
    } else {
      if (wasFps) this._releasePointerLock();
      const fp = this.fpsPivot.position.clone();
      this.camera.removeFromParent();
      this.scene.add(this.camera);
      this.camera.position.set(fp.x, 34, fp.z);
      this._orbitCamPos.copy(this.camera.position);
      this.controls.target.copy(this._orbitTarget);
      this.controls.enabled = true;
      this.controls.update();
      this.canvas.classList.remove('fps-mode');
      this.setBuildMode(this._buildMode);
    }
  }

  toggleViewMode() {
    this.setViewMode(this.viewMode === 'orbit' ? 'fps' : 'orbit');
    return this.viewMode;
  }

  requestPointerLock() {
    if (this.viewMode !== 'fps' || !this.pointerLock || !pointerLockSupported()) return;
    try { this.pointerLock.lock(); } catch (_) { /* iOS */ }
  }

  setKey(code, down) {
    this.keys[code] = down;
  }

  setMobileMove(x, y) {
    this.mobileMove.x = x;
    this.mobileMove.y = y;
  }

  setMobileLook(dx, dy) {
    if (this.viewMode !== 'fps') return;
    this._fpsYaw -= dx * 0.004;
    this._fpsPitch = Math.max(-1.2, Math.min(1.2, this._fpsPitch - dy * 0.004));
    this.fpsPivot.rotation.y = this._fpsYaw;
    this.camera.rotation.x = this._fpsPitch;
  }

  _updateFPS(dt) {
    if (this.viewMode !== 'fps') return;
    const speed = 16 * dt;
    const dir = new THREE.Vector3();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.fpsPivot.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));

    let mx = 0;
    let mz = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) mz -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) mz += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) mx -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) mx += 1;
    mx += this.mobileMove.x;
    mz += this.mobileMove.y;

    dir.addScaledVector(fwd, -mz * speed);
    dir.addScaledVector(right, mx * speed);
    this.fpsPivot.position.add(dir);
    const y = this._terrainHeight(this.fpsPivot.position.x, this.fpsPivot.position.z);
    this.fpsPivot.position.y = y + 2.4;
    const bound = 95;
    this.fpsPivot.position.x = THREE.MathUtils.clamp(this.fpsPivot.position.x, -bound, bound);
    this.fpsPivot.position.z = THREE.MathUtils.clamp(this.fpsPivot.position.z, -bound, bound);
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
    if (!this.previewRing || this.viewMode === 'fps') return;
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
  }

  _buildSky() {
    const skyGeo = new THREE.SphereGeometry(380, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
    this.skyVerts = skyGeo.attributes.position;
    this.skyColors = new Float32Array(this.skyVerts.count * 3);
    skyGeo.setAttribute('color', new THREE.BufferAttribute(this.skyColors, 3));
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);
    this._updateSkyColors(0);
  }

  _updateSkyColors(tf) {
    const bottom = new THREE.Color(this.planet.fog);
    const top = new THREE.Color().copy(this._skyBarren).lerp(this._skyLush, tf);
    for (let i = 0; i < this.skyVerts.count; i++) {
      const y = this.skyVerts.getY(i);
      const t = Math.max(0, (y + 80) / 160);
      const c = bottom.clone().lerp(top, t);
      this.skyColors[i * 3] = c.r;
      this.skyColors[i * 3 + 1] = c.g;
      this.skyColors[i * 3 + 2] = c.b;
    }
    this.skyMesh.geometry.attributes.color.needsUpdate = true;
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
    this._groundVerts = verts;
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
    this.groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.04,
      color: new THREE.Color(this.planet.color)
    });
    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

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

  _buildVegetation() {
    this.vegGroup = new THREE.Group();
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d6b2d, roughness: 0.8 });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 0.85 });
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() - 0.5) * 170;
      const z = (Math.random() - 0.5) * 170;
      if (Math.hypot(x, z) < 14) continue;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.6, 6), treeMat);
      trunk.position.y = 0.3;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.5 + Math.random() * 0.4, 1.2 + Math.random(), 7), i % 3 === 0 ? bushMat : treeMat);
      crown.position.y = 1.1;
      tree.add(trunk, crown);
      tree.position.set(x, this._terrainHeight(x, z), z);
      tree.scale.setScalar(0.6 + Math.random() * 0.8);
      tree.visible = false;
      tree.userData.tfThreshold = 0.08 + Math.random() * 0.85;
      this.vegGroup.add(tree);
    }
    this.scene.add(this.vegGroup);
  }

  _buildLights() {
    this.ambient = new THREE.AmbientLight(0x445566, 0.55);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffeedd, 1.5);
    this.sun.position.set(55, 75, 35);
    this.sun.castShadow = !this._mobileGPU;
    if (this._mobileGPU) this.renderer.shadowMap.enabled = false;
    else this.sun.shadow.mapSize.set(2048, 2048);
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
    const segments = 128;
    const half = 100;
    const u = THREE.MathUtils.clamp((x + half) / 200, 0, 1);
    const v = THREE.MathUtils.clamp((z + half) / 200, 0, 1);
    const ix = Math.floor(u * segments);
    const iy = Math.floor(v * segments);
    const idx = iy * (segments + 1) + ix;
    const verts = this.ground.geometry.attributes.position;
    if (idx >= verts.count) return 0;
    return verts.getY(idx);
  }

  _buildWater() {
    this.waterGroup = new THREE.Group();
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2a6a9a,
      roughness: 0.15,
      metalness: 0.6,
      transparent: true,
      opacity: 0.75,
      emissive: 0x113355,
      emissiveIntensity: 0.15
    });
    const spots = [[-35, -25, 12], [40, 30, 9], [-20, 45, 7], [55, -15, 8], [-50, 10, 10]];
    spots.forEach(([x, z, r]) => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 24), waterMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.15, z);
      pool.visible = false;
      this.waterGroup.add(pool);
    });
    this.scene.add(this.waterGroup);
  }

  _buildOrbitPaths() {
    this.orbitGroup = new THREE.Group();
    this.orbitGroup.position.y = 0;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(55, 55.5, 64),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 45;
    this.orbitGroup.add(ring);
    this.orbitShips = [];
    for (let i = 0; i < 4; i++) {
      const ship = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.4, 2.5),
        new THREE.MeshStandardMaterial({ color: 0xaaccee, emissive: 0x4488ff, emissiveIntensity: 0.5, metalness: 0.8 })
      );
      ship.visible = false;
      ship.userData.orbitAngle = (i / 4) * Math.PI * 2;
      ship.userData.orbitR = 55;
      ship.userData.orbitY = 42 + i * 2;
      this.orbitShips.push(ship);
      this.orbitGroup.add(ship);
    }
    this.scene.add(this.orbitGroup);
  }

  _applyTerraformVisuals(state) {
    const stage = state.terraformStage ?? 0;
    const progress = (state.terraformStageProgress ?? 0) / 100;
    const global = Math.min(1, (stage + progress) / 6);
    if (Math.abs(global - this._lastTf) < 0.004 && !state.planetComplete) return;
    this._lastTf = global;

    this.groundMat.color.copy(this._barrenColor).lerp(this._lushColor, global * 0.95);
    this.groundMat.roughness = 0.92 - global * 0.4;
    if (global > 0.08) {
      this.groundMat.emissive = new THREE.Color(0x0a2a0a);
      this.groundMat.emissiveIntensity = global * 0.25;
    }

    const waterLevel = Math.max(0, (stage - 1.5 + progress) / 4);
    this.waterGroup?.children.forEach((pool, i) => {
      pool.visible = stage >= 2;
      if (pool.visible) pool.material.opacity = 0.4 + waterLevel * 0.45;
      pool.position.y = 0.1 + waterLevel * 0.8;
    });

    const fogCol = new THREE.Color(this.planet.fog).lerp(new THREE.Color(0x8ac4e8), global * 0.8);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = 0.0035 * (1 - global * 0.7);
    this.scene.background.copy(this._skyBarren).lerp(this._skyLush, global * 0.85);
    this._updateSkyColors(global);

    const vegThreshold = Math.max(0.05, 0.35 - stage * 0.04);
    this.vegGroup?.children.forEach((tree) => {
      const threshold = tree.userData.tfThreshold * vegThreshold;
      tree.visible = global >= threshold || stage >= 3;
      if (tree.visible) {
        const fade = Math.min(1, (global - threshold + 0.2) * 3);
        tree.scale.setScalar((0.5 + (tree.userData.tfThreshold % 0.5)) * Math.max(0.3, fade));
      }
    });

    this.orbitGroup.visible = stage >= 1 || (state.fleetMissions || []).length > 0;
  }

  _updateOrbitShips(state, t) {
    const missions = state.fleetMissions || [];
    const count = Math.max(missions.length, state.terraformStage >= 1 ? 1 : 0);
    this.orbitShips.forEach((ship, i) => {
      ship.visible = i < count || missions.length > 0;
      if (!ship.visible) return;
      ship.userData.orbitAngle += 0.15 * (i % 2 === 0 ? 1 : -1) * 0.016;
      const a = ship.userData.orbitAngle + t * 0.08 * (i + 1);
      ship.position.set(
        Math.cos(a) * ship.userData.orbitR,
        ship.userData.orbitY + Math.sin(t * 0.5 + i) * 2,
        Math.sin(a) * ship.userData.orbitR
      );
      ship.rotation.y = -a + Math.PI / 2;
    });
  }

  _createBuildingMesh(type) {
    const grp = new THREE.Group();
    const accent = new THREE.Color(this.planet.accent);

    if (type === 'habitat') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.78 }));
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1.2, 24),
        new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.6, metalness: 0.4 }));
      base.position.y = 0.6; dome.position.y = 1.2;
      grp.add(base, dome);
    } else if (type === 'solar') {
      for (let i = 0; i < 4; i++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 1.2),
          new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.2, metalness: 0.8, emissive: 0x2244aa, emissiveIntensity: 0.2 }));
        panel.position.set((i - 1.5) * 1.6, 0.8, 0); panel.rotation.x = -0.4;
        grp.add(panel);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 }));
      pole.position.y = 0.4;
      grp.add(pole);
    } else if (type === 'farm') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x4a8a4a, emissive: 0x1a4a1a, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 }));
      dome.position.y = 1.3;
      const farmBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.7, 1, 20),
        new THREE.MeshStandardMaterial({ color: 0x556655 }));
      farmBase.position.y = 0.5;
      grp.add(dome, farmBase);
    } else if (type === 'mine') {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 3.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 }));
      tower.position.y = 1.75;
      const drill = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2, 8),
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.35 }));
      drill.position.y = 3.8;
      grp.add(tower, drill);
    } else if (type === 'garage') {
      const bay = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 4),
        new THREE.MeshStandardMaterial({ color: 0x3a4a5a, metalness: 0.5 }));
      bay.position.y = 1.25;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2),
        new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.65, side: THREE.DoubleSide }));
      door.position.set(0, 1.2, 2.01);
      grp.add(bay, door);
    } else if (type === 'terraform' || type === 'hydroponics') {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 4, 12),
        new THREE.MeshStandardMaterial({ color: 0x2a5a3a, emissive: 0x44ff88, emissiveIntensity: 0.35 }));
      core.position.y = 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.15, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 0.55 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 3.5;
      grp.add(core, ring);
    } else if (type === 'research' || type === 'comms') {
      const lab = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.8, 3.5),
        new THREE.MeshStandardMaterial({ color: 0x4a5a7a, metalness: 0.55 }));
      lab.position.y = 1.4;
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xeeeeff, metalness: 0.8 }));
      dish.position.y = 3.4;
      grp.add(lab, dish);
    } else if (type === 'spaceport') {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 8, 10),
        new THREE.MeshStandardMaterial({ color: 0x4a5a6a, metalness: 0.6 }));
      tower.position.y = 4;
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff0000, emissiveIntensity: 0.8 }));
      beacon.position.y = 8.5;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 0.3, 24),
        new THREE.MeshStandardMaterial({ color: 0x334455 }));
      pad.position.y = 0.15;
      grp.add(tower, beacon, pad);
    } else if (type === 'starfleet_yard') {
      const hall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 7),
        new THREE.MeshStandardMaterial({ color: 0x3a4a5a, metalness: 0.5 }));
      hall.position.y = 2;
      const crane = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 0.3 }));
      crane.position.set(3, 3, 0);
      grp.add(hall, crane);
    } else if (type === 'starship') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0xccddee, metalness: 0.8, roughness: 0.2 }));
      body.rotation.x = Math.PI / 2; body.position.y = 2;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9 }));
      nose.rotation.x = -Math.PI / 2; nose.position.set(0, 2, -4);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.7 }));
      wing.position.y = 1.8;
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.9 }));
      glow.position.set(0, 2, 3.5);
      grp.add(body, nose, wing, glow);
    } else if (type === 'orbital_station') {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 1.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.7 }));
      core.position.y = 0.75;
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x8899bb, emissive: 0x2244aa, emissiveIntensity: 0.3, metalness: 0.8 }));
      spire.position.y = 7;
      const dish = new THREE.Mesh(new THREE.TorusGeometry(3, 0.2, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.4 }));
      dish.rotation.x = Math.PI / 2;
      dish.position.y = 10;
      grp.add(core, spire, dish);
    } else if (type === 'shield') {
      const gen = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 3, 12),
        new THREE.MeshStandardMaterial({ color: 0x5a6a8a, emissive: 0x4466ff, emissiveIntensity: 0.25 }));
      gen.position.y = 1.5;
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x4488ff, transparent: true, opacity: 0.15, emissive: 0x2244aa, emissiveIntensity: 0.4 }));
      bubble.position.y = 2.5;
      grp.add(gen, bubble);
    } else {
      const depot = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 4),
        new THREE.MeshStandardMaterial({ color: 0x6a5a4a }));
      depot.position.y = 1;
      grp.add(depot);
    }

    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return grp;
  }

  syncState(state) {
    this._stateRef = state;
    this._applyTerraformVisuals(state);

    const storm = state.activeEvent?.type === 'dust_storm' ? (state.activeEvent.intensity || 0.5) : 0;
    const calm = (state.terraformStage ?? 0) >= 4;
    this.setStormIntensity(calm ? storm * 0.2 : storm);

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
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0),
        new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0xff6600, emissiveIntensity: 0.55, metalness: 0.6 }));
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
          mesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 2.8),
            new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.6 }));
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
    if (this.viewMode === 'fps') return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1) return null;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.pickPlane) return null;
    const hits = this.raycaster.intersectObject(this.pickPlane, false);
    if (!hits.length) return null;
    const p = hits[0].point;
    if (Math.hypot(p.x, p.z) < 8) return null;
    return { x: p.x, z: p.z };
  }

  resize() {
    const parent = this.canvas.parentElement?.closest('#colony-screen') || this.canvas.parentElement;
    if (!parent) return;
    let { w, h } = getParentSize(parent);
    if (w < 2) w = window.visualViewport?.width || window.innerWidth;
    if (h < 2) h = window.visualViewport?.height || window.innerHeight;
    if (w < 2 || h < 2) return;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(t = 0, dt = 0.016) {
    this._updateFPS(dt);
    if (this.dust && this.stormIntensity > 0.05) {
      const pos = this.dust.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + Math.sin(t + i) * 0.04 * this.stormIntensity);
        pos.setZ(i, pos.getZ(i) + Math.cos(t * 0.7 + i) * 0.03 * this.stormIntensity);
      }
      pos.needsUpdate = true;
    }
    if (this.viewMode === 'orbit') this.controls.update();
    if (this._stateRef) this._updateOrbitShips(this._stateRef, t);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._stopResize?.();
    this._releasePointerLock();
    this.renderer.dispose();
  }
}