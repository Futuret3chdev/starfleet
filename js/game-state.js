import { getPlanet } from './planets.js';
import { BUILDINGS } from './buildings.js';

const SAVE_KEY = 'starfleet-save-v2';
const SAVE_KEY_LEGACY = ['starfeet-save-v2', 'starfeet-save-v1', 'starfleet-save-v1'];

export function newColony(planetId, colonyName = 'Outpost Alpha') {
  const planet = getPlanet(planetId);
  return {
    version: 2,
    planetId,
    colonyName,
    tick: 0,
    credits: 1200,
    minerals: 200,
    energy: 40,
    energyCap: 60,
    oxygen: 80,
    food: 60,
    population: 8,
    popCap: 10,
    terraform: planet.terraformBase,
    storage: 300,
    buildings: [],
    trucks: [],
    nodes: generateNodes(planet),
    sectors: generateSectors(planet),
    explored: 1,
    selectedBuild: null,
    paused: false,
    activeEvent: null,
    eventCooldown: 45,
    log: []
  };
}

function generateNodes(planet) {
  const nodes = [];
  const count = 8 + Math.floor(planet.resources.iron / 30);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + planet.seed * 0.1;
    const dist = 18 + (planet.seed % 7) + (i % 4) * 6;
    nodes.push({
      id: `node-${i}`,
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      yield: 3 + (i % 3) * 2,
      depleted: 0,
      max: 400 + planet.resources.iron
    });
  }
  return nodes;
}

function generateSectors(planet) {
  const sectors = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      sectors.push({
        id: `s-${r}-${c}`,
        row: r,
        col: c,
        revealed: r === 2 && c === 2,
        scanned: r === 2 && c === 2,
        anomaly: (r * 5 + c + planet.seed) % 7 === 0 ? pickAnomaly() : null,
        resources: Math.floor(planet.resources.rare * (0.1 + Math.random() * 0.3))
      });
    }
  }
  return sectors;
}

function pickAnomaly() {
  const types = ['ice cave', 'meteor wreck', 'crystal vein', 'ancient probe', 'geyser'];
  return types[Math.floor(Math.random() * types.length)];
}

export function canAfford(state, cost) {
  return state.credits >= (cost.credits || 0) && state.minerals >= (cost.minerals || 0);
}

export function placeBuilding(state, type, x, z) {
  const def = BUILDINGS[type];
  if (!def || !canAfford(state, def.cost)) return false;
  const occupied = state.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 5);
  if (occupied) return false;

  state.credits -= def.cost.credits || 0;
  state.minerals -= def.cost.minerals || 0;
  state.buildings.push({ id: `${type}-${Date.now()}`, type, x, z, level: 1 });

  if (def.popCap) state.popCap += def.popCap;
  if (def.storage) state.storage += def.storage;
  if (def.truckCap) spawnTrucks(state, def.truckCap, x, z);
  return true;
}

function spawnTrucks(state, count, x = 0, z = 0) {
  for (let i = 0; i < count; i++) {
    state.trucks.push({
      id: `truck-${Date.now()}-${i}`,
      x,
      z,
      targetNode: null,
      cargo: 0,
      phase: 'idle',
      t: 0
    });
  }
}

export function exploreSector(state, sectorId) {
  const sector = state.sectors.find((s) => s.id === sectorId);
  if (!sector || sector.revealed) return false;
  const hasLab = state.buildings.some((b) => b.type === 'research');
  const cost = Math.floor((80 + state.explored * 20) / (hasLab ? 1.5 : 1));
  if (state.credits < cost) return false;
  state.credits -= cost;
  sector.revealed = true;
  sector.scanned = true;
  state.explored += 1;
  if (sector.anomaly) {
    state.credits += 150;
    state.minerals += 40 + sector.resources;
    pushLog(state, `Anomaly found: ${sector.anomaly}`);
  } else {
    state.minerals += 15 + Math.floor(sector.resources * 0.3);
    pushLog(state, 'Sector surveyed — minerals logged');
  }
  return true;
}

function pushLog(state, msg) {
  state.log = state.log || [];
  state.log.unshift({ t: state.tick, msg });
  if (state.log.length > 8) state.log.pop();
}

export function simulateTick(state, dt = 1) {
  if (state.paused) return;
  state.tick += dt;

  updateEvents(state, dt);

  let powerGen = 0;
  let powerUse = 0;
  let harvest = 0;
  let terraformRate = 0;

  const storm = state.activeEvent?.type === 'dust_storm';
  const stormPenalty = storm ? (1 - (state.activeEvent.intensity || 0.5) * 0.6) : 1;

  state.buildings.forEach((b) => {
    const def = BUILDINGS[b.type];
    if (!def) return;
    if (def.power > 0) powerGen += def.power * (b.type === 'solar' ? stormPenalty : 1);
    else powerUse += Math.abs(def.power);
    if (def.harvest) harvest += def.harvest;
    if (def.terraform) terraformRate += def.terraform;
  });

  state.energy = Math.min(state.energyCap, state.energy + powerGen * dt * 0.5);
  const powerRatio = powerUse > 0 ? Math.min(1, state.energy / powerUse) : 1;
  state.energy = Math.max(0, state.energy - powerUse * dt * 0.5);

  if (powerRatio > 0.3) {
    state.terraform = Math.min(100, state.terraform + terraformRate * powerRatio * dt);
    state.minerals += harvest * powerRatio * dt * 0.4;
    state.credits += state.population * 0.6 * dt;
    state.oxygen = Math.min(100, state.oxygen + state.terraform * 0.002 * dt);
    state.food = Math.min(100, state.food + (state.buildings.filter((b) => b.type === 'habitat').length * 0.8) * dt);
  } else {
    state.oxygen = Math.max(0, state.oxygen - 0.5 * dt);
    state.food = Math.max(0, state.food - 0.4 * dt);
  }

  state.population = Math.min(state.popCap, state.population + (state.food > 40 ? 0.02 : -0.05) * dt);

  updateTrucks(state, dt);
}

function updateEvents(state, dt) {
  state.eventCooldown = (state.eventCooldown ?? 60) - dt;

  if (state.activeEvent) {
    state.activeEvent.remaining = (state.activeEvent.remaining || 0) - dt;
    if (state.activeEvent.type === 'dust_storm') {
      state.activeEvent.intensity = Math.min(1, (state.activeEvent.intensity || 0.5) + dt * 0.02);
      if (state.activeEvent.remaining <= 10) {
        state.activeEvent.intensity = Math.max(0, state.activeEvent.intensity - dt * 0.08);
      }
    }
    if (state.activeEvent.remaining <= 0) {
      pushLog(state, `${eventLabel(state.activeEvent)} ended`);
      state.activeEvent = null;
      state.eventCooldown = 50 + Math.random() * 40;
    }
    return;
  }

  if (state.eventCooldown > 0) return;

  const planet = getPlanet(state.planetId);
  const chance = (planet.stormChance || 0.15) * dt * 0.15;
  if (Math.random() < chance) {
    state.activeEvent = {
      type: 'dust_storm',
      remaining: 25 + Math.random() * 20,
      intensity: 0.35 + Math.random() * 0.35
    };
    pushLog(state, 'DUST STORM — solar output reduced');
  }
}

function eventLabel(ev) {
  if (ev.type === 'dust_storm') return 'Dust storm';
  return 'Event';
}

export function getEventMessage(state) {
  if (!state.activeEvent) return null;
  if (state.activeEvent.type === 'dust_storm') {
    return `⚠ Dust Storm — solar −${Math.round((state.activeEvent.intensity || 0.5) * 60)}%`;
  }
  return null;
}

function updateTrucks(state, dt) {
  const garages = state.buildings.filter((b) => b.type === 'garage');
  if (!garages.length) return;

  state.trucks.forEach((truck, idx) => {
    const garage = garages[idx % garages.length];
    const speed = 8 * dt;

    if (truck.phase === 'idle' || !truck.targetNode) {
      const node = state.nodes
        .filter((n) => n.depleted < n.max)
        .sort((a, b) => Math.hypot(a.x - garage.x, a.z - garage.z) - Math.hypot(b.x - garage.x, b.z - garage.z))[0];
      if (node) {
        truck.targetNode = node.id;
        truck.phase = 'toNode';
      }
      truck.x = garage.x;
      truck.z = garage.z;
      return;
    }

    const node = state.nodes.find((n) => n.id === truck.targetNode);
    if (!node) { truck.phase = 'idle'; return; }

    if (truck.phase === 'toNode') {
      moveToward(truck, node.x, node.z, speed);
      if (Math.hypot(truck.x - node.x, truck.z - node.z) < 1.5) {
        truck.cargo = Math.min(20, node.yield * 3);
        node.depleted += truck.cargo;
        truck.phase = 'return';
      }
    } else if (truck.phase === 'return') {
      moveToward(truck, garage.x, garage.z, speed);
      if (Math.hypot(truck.x - garage.x, truck.z - garage.z) < 2) {
        state.minerals += truck.cargo;
        state.credits += truck.cargo * 0.5;
        truck.cargo = 0;
        truck.phase = 'idle';
        truck.targetNode = null;
      }
    }
  });
}

function moveToward(obj, tx, tz, speed) {
  const dx = tx - obj.x;
  const dz = tz - obj.z;
  const dist = Math.hypot(dx, dz) || 1;
  obj.x += (dx / dist) * speed;
  obj.z += (dz / dist) * speed;
  obj.t = Math.atan2(dx, dz);
}

export function saveGame(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (_) {}
}

export function loadGame() {
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      for (const key of SAVE_KEY_LEGACY) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
      if (raw) {
        const legacy = JSON.parse(raw);
        legacy.version = 2;
        legacy.activeEvent = legacy.activeEvent ?? null;
        legacy.eventCooldown = legacy.eventCooldown ?? 30;
        legacy.log = legacy.log ?? [];
        saveGame(legacy);
        return legacy;
      }
    }
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}