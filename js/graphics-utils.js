import * as THREE from 'three';

/** Procedural planet surface texture — craters, bands, polar caps. */
export function makePlanetTexture(planet, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(planet.color);
  const r = Math.floor(col.r * 255);
  const g = Math.floor(col.g * 255);
  const b = Math.floor(col.b * 255);

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.55);
  grad.addColorStop(0, `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 20)},${Math.min(255, b + 15)})`);
  grad.addColorStop(0.6, `rgb(${r},${g},${b})`);
  grad.addColorStop(1, `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 35)},${Math.max(0, b - 30)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const seed = planet.seed || 1;
  const craterCount = 12 + (seed % 20);
  for (let i = 0; i < craterCount; i++) {
    const x = ((seed * (i + 3) * 97) % 1000) / 1000 * size;
    const y = ((seed * (i + 7) * 53) % 1000) / 1000 * size;
    const rad = 4 + ((seed + i * 11) % 18);
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.max(0, r - 25)},${Math.max(0, g - 20)},${Math.max(0, b - 15)},0.55)`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - rad * 0.2, y - rad * 0.2, rad * 0.65, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.min(255, r + 15)},${Math.min(255, g + 10)},${Math.min(255, b + 8)},0.25)`;
    ctx.fill();
  }

  if (planet.atmosphere > 0.5) {
    for (let y = 0; y < size; y += 3) {
      const band = Math.sin(y * 0.04 + seed) * 12;
      ctx.fillStyle = `rgba(${r + band},${g + band * 0.6},${b + band * 0.3},0.12)`;
      ctx.fillRect(0, y, size, 2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Heightmap for displaced colony terrain. */
export function makeHeightmap(planet, size = 256) {
  const data = new Float32Array(size * size);
  const seed = planet.seed || 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const n =
        Math.sin(nx * 12 + seed) * 0.3 +
        Math.sin(ny * 9 + seed * 0.7) * 0.25 +
        Math.sin((nx + ny) * 18 + seed * 1.3) * 0.15 +
        Math.sin(nx * 28) * Math.cos(ny * 22) * 0.1;
      const crater = Math.max(0, 0.4 - Math.hypot(nx - 0.35, ny - 0.62) * 2.5);
      data[y * size + x] = Math.max(0, n * 0.5 + crater * 0.8);
    }
  }
  return { data, size };
}

export function makeTerrainTexture(planet, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(planet.color);
  const r = Math.floor(col.r * 255);
  const g = Math.floor(col.g * 255);
  const b = Math.floor(col.b * 255);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = Math.random() * 50 - 25;
    ctx.fillStyle = `rgb(${r + shade},${g + shade * 0.6},${b + shade * 0.4})`;
    ctx.fillRect(x, y, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }

  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 8 + Math.random() * 30;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${Math.max(0, r - 30)},${Math.max(0, g - 25)},${Math.max(0, b - 20)},0.35)`;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Touch / narrow screens — use lighter WebGL settings. */
export function isMobileGPU() {
  return window.innerWidth < 700 || window.matchMedia('(pointer: coarse)').matches;
}

/** v7-style renderer — worked on mobile; single AA-off fallback only. */
export function createWebGLRenderer(canvas) {
  const mobile = isMobileGPU();
  const configs = [
    { antialias: true, alpha: false, failIfMajorPerformanceCaveat: false },
    { antialias: false, alpha: false, failIfMajorPerformanceCaveat: false }
  ];
  for (const opts of configs) {
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, ...opts });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      return { renderer, mobile };
    } catch (_) { /* try without antialias */ }
  }
  return { renderer: null, mobile };
}

/** Reliable size for WebGL parents — iOS often reports 0 until layout settles. */
export function getParentSize(parent) {
  if (!parent) return { w: 0, h: 0 };
  let w = parent.clientWidth;
  let h = parent.clientHeight;
  if (w < 2 || h < 2) {
    const rect = parent.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
  }
  if (w < 2 || h < 2) {
    const vv = window.visualViewport;
    w = vv?.width || window.innerWidth;
    h = vv?.height || window.innerHeight;
  }
  return { w: Math.floor(w), h: Math.floor(h) };
}

/** Attach ResizeObserver so WebGL canvas always matches parent size. */
export function observeCanvasResize(parent, onResize) {
  if (!parent) return () => {};
  const tick = () => onResize();
  const ro = new ResizeObserver(tick);
  ro.observe(parent);
  const onVV = () => tick();
  window.visualViewport?.addEventListener('resize', onVV);
  window.addEventListener('orientationchange', onVV);
  requestAnimationFrame(tick);
  setTimeout(tick, 50);
  setTimeout(tick, 250);
  setTimeout(tick, 600);
  return () => {
    ro.disconnect();
    window.visualViewport?.removeEventListener('resize', onVV);
    window.removeEventListener('orientationchange', onVV);
  };
}