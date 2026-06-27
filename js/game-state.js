import { getPlanet } from './planets.js';
import { BUILDINGS } from './buildings.js';
import { TERRAFORM_STAGES, getStage, getTotalProgress, migrateLegacyTerraform } from './terraform-stages.js';
import { FLEET_MISSIONS, getMission } from './fleet-missions.js';

const SAVE_KEY = 'starfleet-save-v4';
const SAVE_KEY_LEGACY = ['starfleet-save-v3', 'starfleet-save-v2', 'starfeet-save-v2', 'starfeet-save-v1'];

const STAGE_REWARDS = {
  1: { credits: 400, msg: '🌫 Atmosphere phase — breathable air emerging' },
  2: { credits: 600, minerals: 150, msg: '💧 Hydrosphere — lakes forming across surface' },
  3: { credits: 800, minerals: 100, msg: '🌿 Biosphere — forests taking root' },
  4: { credits: 1200, popCap: 20, msg: '🏙 Habitable world — cities can thrive' },
  5: { credits: 5000, minerals: 1000, popCap: 50, msg: '🌍 Eden World — Earth-like planet achieved!' },
  6: { credits: 8000, minerals: 2000, popCap: 100, msg: '✦ Starfleet Hub — interstellar gateway online' }
};

export function newColony(planetId, colonyName = 'Outpost Alpha') {
  const planet = getPlanet(planetId);
  return {
    version: 4,
    planetId,
    colonyName,
    tick: 0,
    credits: 1400,
    minerals: 250,
    energy: 80,
    energyCap: 120,
    oxygen: 80,
    food: 60,
    population: 8,
    popCap: 10,
    terraformStage: 0,
    terraformStageProgress: planet.terraformBase || 0,
    terraform: 0,
    terraformComplete: false,
    planetComplete: false,
    storage: 300,
    buildings: [{ id: 'starter-solar', type: 'solar', x: 14, z: 2, level: 1 }],
    trucks: [],
    fleetMissions: [],
    nodes: generateNodes(planet),
    sectors: generateSectors(planet),
    explored: 1,
    paused: false,
    activeEvent: null,
    eventCooldown: 45,
    log: [],
    tradeConvoys: 0
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
        row: r, col: c,
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

export function syncTerraformDisplay(state) {
  migrateLegacyTerraform(state);
  state.terraform = getTotalProgress(state.terraformStage, state.terraformStageProgress);
  state.terraformComplete = state.terraformStage >= 5;
}

export function syncEnergyCap(state) {
  const solarCount = state.buildings?.filter((b) => b.type === 'solar').length || 0;
  state.energyCap = 80 + solarCount * 60;
}

/** Generation vs demand — used by simulation and HUD. */
export function getPowerStats(state) {
  if (!state?.buildings) return { gen: 0, use: 0, net: 0, stored: 0, cap: 120, ratio: 1 };
  let gen = 0;
  let use = 0;
  let stormShield = 0;
  const storm = state.activeEvent?.type === 'dust_storm';
  state.buildings.forEach((b) => {
    const def = BUILDINGS[b.type];
    if (def?.stormShield) stormShield = Math.max(stormShield, def.stormShield);
  });
  const stormPenalty = storm
    ? 1 - (state.activeEvent.intensity || 0.5) * 0.6 * (1 - stormShield)
    : 1;
  state.buildings.forEach((b) => {
    const def = BUILDINGS[b.type];
    if (!def?.power) return;
    if (def.power > 0) gen += def.power * (b.type === 'solar' ? stormPenalty : 1);
    else use += Math.abs(def.power);
  });
  syncEnergyCap(state);
  const stored = Number.isFinite(state.energy) ? state.energy : 0;
  const cap = state.energyCap || 120;
  const net = gen - use;
  const ratio = use > 0 ? Math.min(1, gen / use) : 1;
  return { gen, use, net, stored, cap, ratio };
}

export function canAfford(state, cost) {
  return state.credits >= (cost.credits || 0) && state.minerals >= (cost.minerals || 0);
}

export function getFleetCap(state) {
  let cap = state.buildings.reduce((sum, b) => sum + (BUILDINGS[b.type]?.fleetCap || 0), 0);
  if (state.buildings.some((b) => b.type === 'orbital_station')) cap += 2;
  return cap;
}

export function getFleetCount(state) {
  return state.buildings.filter((b) => b.type === 'starship').length;
}

export function getIdleShips(state) {
  const busy = new Set((state.fleetMissions || []).map((m) => m.shipId));
  return state.buildings.filter((b) => b.type === 'starship' && !busy.has(b.id));
}

export function getStageRequirement(def) {
  if (def.requiresStage != null) return def.requiresStage;
  if (def.requiresTerraform != null) return Math.floor(def.requiresTerraform / 17);
  return 0;
}

export function isBuildingUnlocked(state, type) {
  const def = BUILDINGS[type];
  if (!def) return false;
  syncTerraformDisplay(state);
  if (state.planetComplete) return true;
  if (state.terraformStage < getStageRequirement(def)) return false;
  if (def.requires && !state.buildings.some((b) => b.type === def.requires)) return false;
  if (type === 'starship' && getFleetCount(state) >= getFleetCap(state)) return false;
  return true;
}

export function getBuildingLockReason(state, type) {
  const def = BUILDINGS[type];
  if (!def) return 'Unknown';
  syncTerraformDisplay(state);
  if (state.planetComplete) return null;
  const reqStage = getStageRequirement(def);
  if (state.terraformStage < reqStage) {
    return `Needs ${getStage(reqStage).name} phase`;
  }
  if (def.requires && !state.buildings.some((b) => b.type === def.requires)) {
    return `Needs ${BUILDINGS[def.requires]?.name || def.requires}`;
  }
  if (type === 'starship' && getFleetCount(state) >= getFleetCap(state)) {
    return 'Fleet capacity full';
  }
  return null;
}

export function isMissionUnlocked(state, mission) {
  syncTerraformDisplay(state);
  return state.terraformStage >= (mission.minStage || 0);
}

export function launchFleetMission(state, missionId, shipId) {
  const mission = getMission(missionId);
  if (!mission || !isMissionUnlocked(state, mission)) return false;
  const ship = state.buildings.find((b) => b.id === shipId && b.type === 'starship');
  if (!ship) return false;
  if ((state.fleetMissions || []).some((m) => m.shipId === shipId)) return false;
  const cost = mission.cost || {};
  if (!canAfford(state, cost)) return false;

  state.credits -= cost.credits || 0;
  state.minerals -= cost.minerals || 0;
  state.fleetMissions = state.fleetMissions || [];
  state.fleetMissions.push({
    id: `mission-${Date.now()}`,
    missionId,
    shipId,
    remaining: mission.duration,
    total: mission.duration,
    name: mission.name
  });
  pushLog(state, `🚀 ${mission.name} launched — ship in orbit`);
  return true;
}

function completeFleetMission(state, m) {
  const mission = getMission(m.missionId);
  if (!mission) return null;
  const r = mission.rewards || {};
  state.credits += r.credits || 0;
  state.minerals += r.minerals || 0;
  if (r.popCap) state.popCap += r.popCap;
  let tfResult = { stageAdvanced: null, planetComplete: false };
  if (r.terraform) tfResult = addTerraformProgress(state, r.terraform);
  pushLog(state, `✓ ${mission.name} complete — rewards received`);
  return { mission, tfResult };
}

export function placeBuilding(state, type, x, z) {
  const def = BUILDINGS[type];
  if (!def || !canAfford(state, def.cost) || !isBuildingUnlocked(state, type)) return false;
  if (state.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < 4.5)) return false;

  state.credits -= def.cost.credits || 0;
  state.minerals -= def.cost.minerals || 0;
  state.buildings.push({ id: `${type}-${Date.now()}`, type, x, z, level: 1 });

  if (def.popCap) state.popCap += def.popCap;
  if (def.storage) state.storage += def.storage;
  if (def.truckCap) spawnTrucks(state, def.truckCap, x, z);
  if (def.fleetCap) pushLog(state, `Fleet capacity +${def.fleetCap}`);
  if (def.fleet) pushLog(state, 'Starship ready for orbit missions');
  if (type === 'solar') {
    syncEnergyCap(state);
    const stats = getPowerStats(state);
    pushLog(state, `☀️ Solar online — +${Math.round(stats.gen)} gen / −${Math.round(stats.use)} demand`);
  }
  return true;
}

function spawnTrucks(state, count, x = 0, z = 0) {
  for (let i = 0; i < count; i++) {
    state.trucks.push({
      id: `truck-${Date.now()}-${i}`,
      x, z, targetNode: null, cargo: 0, phase: 'idle', t: 0
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
    addTerraformProgress(state, 1.5);
    pushLog(state, `Anomaly: ${sector.anomaly}`);
  } else {
    state.minerals += 15 + Math.floor(sector.resources * 0.3);
    pushLog(state, 'Sector surveyed');
  }
  return true;
}

function pushLog(state, msg) {
  state.log = state.log || [];
  state.log.unshift({ t: state.tick, msg });
  if (state.log.length > 10) state.log.pop();
}

function applyStageReward(state, stage) {
  const reward = STAGE_REWARDS[stage];
  if (!reward) return;
  state.credits += reward.credits || 0;
  state.minerals += reward.minerals || 0;
  state.popCap += reward.popCap || 0;
  if (stage >= 4) { state.oxygen = Math.min(100, state.oxygen + 20); state.food = Math.min(100, state.food + 20); }
  pushLog(state, reward.msg);
}

function applyPlanetComplete(state) {
  state.oxygen = 100;
  state.food = 100;
  pushLog(state, '🏆 Planet transformation complete — Starfleet commands the system');
}

export function addTerraformProgress(state, amount) {
  if (state.planetComplete) return { stageAdvanced: null, planetComplete: false };
  let stageAdvanced = null;
  state.terraformStageProgress = (state.terraformStageProgress || 0) + amount;

  while (state.terraformStageProgress >= 100 && state.terraformStage < 6) {
    state.terraformStageProgress -= 100;
    state.terraformStage++;
    stageAdvanced = state.terraformStage;
    applyStageReward(state, state.terraformStage);
  }

  let planetComplete = false;
  if (state.terraformStage >= 6 && state.terraformStageProgress >= 100) {
    state.terraformStageProgress = 100;
    if (!state.planetComplete) {
      state.planetComplete = true;
      applyPlanetComplete(state);
      planetComplete = true;
      stageAdvanced = 6;
    }
  }

  syncTerraformDisplay(state);
  return { stageAdvanced, planetComplete };
}

export function simulateTick(state, dt = 1) {
  if (state.paused) return { stageAdvanced: null, planetComplete: false, missionsComplete: [] };
  state.tick += dt;
  syncTerraformDisplay(state);

  updateEvents(state, dt);
  const missionsComplete = updateFleetMissions(state, dt);
  let missionStage = null;
  let missionPlanet = false;
  missionsComplete.forEach((entry) => {
    if (entry?.tfResult?.stageAdvanced != null) missionStage = entry.tfResult.stageAdvanced;
    if (entry?.tfResult?.planetComplete) missionPlanet = true;
  });

  const power = getPowerStats(state);
  let harvest = 0, terraformRate = 0, foodRate = 0;
  let creditBoost = 1, stormShield = 0;
  const hasOrbital = state.buildings.some((b) => b.type === 'orbital_station');

  state.buildings.forEach((b) => {
    const def = BUILDINGS[b.type];
    if (!def) return;
    if (def.harvest) harvest += def.harvest;
    if (def.terraform) terraformRate += def.terraform;
    if (def.foodRate) foodRate += def.foodRate;
    if (def.creditBoost) creditBoost += def.creditBoost * 0.12;
    if (def.stormShield) stormShield = Math.max(stormShield, def.stormShield);
  });

  if (hasOrbital) { creditBoost += 0.25; terraformRate += 0.05; }

  const passiveTerraform = 0.025 + state.population * 0.0012 + state.terraformStage * 0.008;
  state.energy = Math.max(0, Math.min(power.cap, power.stored + power.net * dt));
  const reserveBoost = power.use > 0 ? Math.min(1, (state.energy + power.gen * 0.35) / (power.use + 1)) : 1;
  const powerRatio = Math.min(1, Math.max(power.ratio, reserveBoost));

  const habitatCount = state.buildings.filter((b) => b.type === 'habitat').length;
  const tfGain = (passiveTerraform + terraformRate * powerRatio) * dt;
  const tfResult = addTerraformProgress(state, tfGain);

  if (powerRatio > 0.15 || power.gen >= power.use) {
    state.minerals += harvest * Math.max(powerRatio, 0.4) * dt * 0.5;
    state.credits += state.population * 0.85 * creditBoost * dt;
    const o2boost = 0.08 + state.terraformStage * 0.02;
    state.oxygen = Math.min(100, state.oxygen + o2boost * dt);
    state.food = Math.min(100, state.food + (habitatCount * 1.2 + foodRate + 0.3) * dt);
  } else {
    state.oxygen = Math.max(0, state.oxygen - 0.25 * dt);
    state.food = Math.max(0, state.food - 0.2 * dt);
  }

  state.population = Math.min(state.popCap, state.population + (state.food > 40 ? 0.035 : -0.03) * dt);

  if (state.terraformStage >= 3 && Math.random() < dt * 0.02) {
    state.credits += 50 + state.terraformStage * 20;
    state.tradeConvoys = (state.tradeConvoys || 0) + 1;
  }

  updateTrucks(state, dt);
  const stageAdvanced = tfResult.stageAdvanced ?? missionStage;
  const planetComplete = tfResult.planetComplete || missionPlanet;
  return { stageAdvanced, planetComplete, missionsComplete };
}

function updateFleetMissions(state, dt) {
  if (!state.fleetMissions?.length) return [];
  const done = [];
  state.fleetMissions.forEach((m) => {
    m.remaining -= dt;
    if (m.remaining <= 0) done.push(m);
  });
  const results = [];
  done.forEach((m) => {
    const entry = completeFleetMission(state, m);
    if (entry) results.push(entry);
    state.fleetMissions = state.fleetMissions.filter((x) => x.id !== m.id);
  });
  return results;
}

function updateEvents(state, dt) {
  state.eventCooldown = (state.eventCooldown ?? 60) - dt;
  if (state.activeEvent) {
    state.activeEvent.remaining -= dt;
    if (state.activeEvent.type === 'dust_storm') {
      state.activeEvent.intensity = Math.min(1, (state.activeEvent.intensity || 0.5) + dt * 0.02);
      if (state.activeEvent.remaining <= 10) {
        state.activeEvent.intensity = Math.max(0, state.activeEvent.intensity - dt * 0.08);
      }
    }
    if (state.activeEvent.remaining <= 0) {
      pushLog(state, 'Dust storm ended');
      state.activeEvent = null;
      state.eventCooldown = 40 + Math.random() * 30;
    }
    return;
  }
  if (state.eventCooldown > 0 || state.terraformStage >= 5) return;
  const planet = getPlanet(state.planetId);
  if (Math.random() < (planet.stormChance || 0.12) * dt * 0.1) {
    state.activeEvent = { type: 'dust_storm', remaining: 20 + Math.random() * 25, intensity: 0.3 + Math.random() * 0.4 };
    pushLog(state, 'DUST STORM incoming');
  }
}

export function getEventMessage(state) {
  syncTerraformDisplay(state);
  if (state.planetComplete) return '✦ Starfleet Hub — interstellar missions available';
  const power = getPowerStats(state);
  if (power.gen > 0 && power.net < 0) {
    return `⚡ Power deficit — +${Math.round(power.gen)} gen vs −${Math.round(power.use)} demand · build more solar`;
  }
  if ((state.fleetMissions || []).length) {
    const m = state.fleetMissions[0];
    return `🛸 ${m.name} — ${Math.ceil(m.remaining)}s remaining`;
  }
  if (!state.activeEvent) return null;
  if (state.activeEvent.type === 'dust_storm') {
    return `⚠ Dust Storm — solar −${Math.round((state.activeEvent.intensity || 0.5) * 55)}%`;
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
      const node = state.nodes.filter((n) => n.depleted < n.max)
        .sort((a, b) => Math.hypot(a.x - garage.x, a.z - garage.z) - Math.hypot(b.x - garage.x, b.z - garage.z))[0];
      if (node) { truck.targetNode = node.id; truck.phase = 'toNode'; }
      truck.x = garage.x; truck.z = garage.z;
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
  const dx = tx - obj.x, dz = tz - obj.z;
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
    }
    if (!raw) return null;
    const state = JSON.parse(raw);
    state.version = 4;
    state.fleetMissions = state.fleetMissions || [];
    state.buildings = state.buildings || [];
    if (!Number.isFinite(state.energy)) state.energy = 80;
    migrateLegacyTerraform(state);
    syncTerraformDisplay(state);
    syncEnergyCap(state);
    state.energy = Math.min(state.energy, state.energyCap);
    saveGame(state);
    return state;
  } catch (_) { return null; }
}