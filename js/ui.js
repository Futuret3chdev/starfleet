import { BUILDINGS, BUILD_ORDER, BUILD_CATEGORIES } from './buildings.js';
import { getPlanet } from './planets.js';
import { TERRAFORM_STAGES, getStage, getTotalProgress } from './terraform-stages.js';
import { FLEET_MISSIONS } from './fleet-missions.js';
import {
  canAfford, getEventMessage, isBuildingUnlocked, getBuildingLockReason,
  getFleetCount, getFleetCap, getIdleShips, isMissionUnlocked, syncTerraformDisplay,
  getPowerStats
} from './game-state.js';

export function bindUI(handlers) {
  const screens = {
    title: document.getElementById('title-screen'),
    select: document.getElementById('select-screen'),
    colony: document.getElementById('colony-screen')
  };

  function show(name) {
    Object.values(screens).forEach((s) => s?.classList.remove('active'));
    screens[name]?.classList.add('active');
  }

  document.getElementById('btn-new-game')?.addEventListener('click', () => { handlers.onNewGame?.(); show('select'); });
  document.getElementById('btn-continue')?.addEventListener('click', () => handlers.onContinue?.());
  document.getElementById('btn-select-back')?.addEventListener('click', () => show('title'));
  document.getElementById('btn-launch')?.addEventListener('click', () => handlers.onLaunch?.());
  document.getElementById('btn-pause')?.addEventListener('click', () => handlers.onPause?.());
  document.getElementById('btn-menu')?.addEventListener('click', () => handlers.onMenu?.());
  document.getElementById('btn-fps')?.addEventListener('click', () => handlers.onToggleFPS?.());
  document.getElementById('btn-build-toggle')?.addEventListener('click', () => togglePanel('build-panel'));
  document.getElementById('btn-explore-toggle')?.addEventListener('click', () => togglePanel('explore-panel'));
  document.getElementById('btn-fleet-toggle')?.addEventListener('click', () => togglePanel('fleet-panel'));
  document.getElementById('fab-build')?.addEventListener('click', () => openPanel('build-panel'));
  document.getElementById('fab-fleet')?.addEventListener('click', () => openPanel('fleet-panel'));
  document.getElementById('btn-victory-close')?.addEventListener('click', () => document.getElementById('victory-modal')?.classList.remove('open'));
  document.getElementById('btn-stage-close')?.addEventListener('click', () => document.getElementById('stage-modal')?.classList.remove('open'));

  document.getElementById('explore-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('explore-panel');
    panel?.classList.toggle('open');
    panel?.classList.remove('collapsed');
  });

  document.getElementById('fleet-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('fleet-panel');
    panel?.classList.toggle('open');
    panel?.classList.remove('collapsed');
  });

  buildBuildList(handlers.onSelectBuild);
  buildFleetMissions(handlers.onLaunchMission);

  if (window.innerWidth < 768) {
    document.getElementById('build-panel')?.classList.add('collapsed');
    document.getElementById('fleet-panel')?.classList.add('collapsed');
  }

  return { show, updateHUD, updatePlanetCard, updateBuildPanel, updateExploreGrid, updateEventBanner, updateFleetPanel, updateStageTimeline, showVictory, showStageAdvance, toast };
}

function buildBuildList(onSelect) {
  const list = document.getElementById('build-list');
  if (!list) return;
  list.innerHTML = '';
  let lastCat = '';
  BUILD_ORDER.forEach((id) => {
    const def = BUILDINGS[id];
    if (!def) return;
    if (def.category !== lastCat) {
      lastCat = def.category;
      const label = document.createElement('div');
      label.className = 'build-category';
      label.textContent = BUILD_CATEGORIES[lastCat] || lastCat;
      list.appendChild(label);
    }
    const btn = document.createElement('button');
    btn.className = 'build-btn';
    btn.dataset.build = id;
    btn.innerHTML = `<span class="build-icon">${def.icon}</span><span class="build-name">${def.name}</span><span class="build-cost">₡${def.cost.credits} · ⛏${def.cost.minerals}</span>`;
    btn.addEventListener('click', () => onSelect?.(id));
    list.appendChild(btn);
  });
}

function buildFleetMissions(onLaunch) {
  const list = document.getElementById('fleet-mission-list');
  if (!list) return;
  list.innerHTML = '';
  FLEET_MISSIONS.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'fleet-mission-btn';
    btn.dataset.mission = m.id;
    btn.innerHTML = `<span>${m.icon}</span><span class="fleet-mission-name">${m.name}</span><span class="fleet-mission-time">${m.duration}s</span>`;
    btn.title = m.desc;
    btn.addEventListener('click', () => onLaunch?.(m.id));
    list.appendChild(btn);
  });
}

function togglePanel(id) {
  document.getElementById(id)?.classList.toggle('collapsed');
}

function openPanel(id) {
  document.getElementById(id)?.classList.remove('collapsed');
}

export function updateStageTimeline(state) {
  const el = document.getElementById('stage-timeline');
  if (!el || !state) return;
  syncTerraformDisplay(state);
  el.innerHTML = TERRAFORM_STAGES.map((s) => {
    const done = state.terraformStage > s.id || (s.id === 6 && state.planetComplete);
    const active = state.terraformStage === s.id && !state.planetComplete;
    const cls = done ? 'done' : active ? 'active' : 'pending';
    return `<span class="stage-dot ${cls}" title="${s.name}: ${s.desc}">${s.icon}</span>`;
  }).join('');
}

export function updateFleetPanel(state) {
  if (!state) return;
  const list = document.querySelectorAll('.fleet-mission-btn');
  const idle = getIdleShips(state);
  const active = state.fleetMissions || [];

  list.forEach((btn) => {
    const m = FLEET_MISSIONS.find((x) => x.id === btn.dataset.mission);
    const unlocked = m && isMissionUnlocked(state, m);
    const afford = m && canAfford(state, m.cost || {});
    const hasShip = idle.length > 0;
    btn.classList.toggle('locked', !unlocked);
    btn.classList.toggle('disabled', !afford || !hasShip);
    if (!unlocked) btn.title = `Unlocks at ${getStage(m.minStage).name} phase`;
    else if (!hasShip) btn.title = 'Need idle starship';
    else btn.title = m.desc;
  });

  const status = document.getElementById('fleet-status');
  const activeEl = document.getElementById('fleet-active');
  if (status) {
    if (active.length) {
      status.textContent = `${active.length} mission(s) in orbit · watch ships circle the colony`;
    } else if (getFleetCap(state) > 0) {
      status.textContent = `${idle.length} ship(s) ready · ${getFleetCount(state)}/${getFleetCap(state)} docked`;
    } else {
      status.textContent = 'Build Spaceport & Starships to launch orbit missions';
    }
  }
  if (activeEl) {
    activeEl.innerHTML = active.map((m) => {
      const pct = Math.max(0, Math.min(100, ((m.total - m.remaining) / m.total) * 100));
      return `<div class="fleet-mission-progress"><span>🛸 ${m.name} — ${Math.ceil(m.remaining)}s</span><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');
  }
}

export function showStageAdvance(state, stageId) {
  const stage = getStage(stageId);
  const modal = document.getElementById('stage-modal');
  const title = document.getElementById('stage-modal-title');
  const msg = document.getElementById('stage-modal-msg');
  if (title) title.textContent = `${stage.icon} Phase ${stageId + 1}: ${stage.name}`;
  if (msg) msg.textContent = stage.desc;
  modal?.classList.add('open');
}

export function showVictory(state) {
  const modal = document.getElementById('victory-modal');
  const msg = document.getElementById('victory-msg');
  const title = document.querySelector('#victory-modal h2');
  const planet = getPlanet(state.planetId);
  if (title) title.textContent = state.planetComplete ? '✦ Starfleet Hub Online!' : '🌍 Eden World Achieved!';
  if (msg) {
    msg.innerHTML = state.planetComplete
      ? `<strong>${state.colonyName}</strong> is now a <strong>Starfleet Hub</strong> on ${planet.name}. Launch interstellar missions and command the system.`
      : `<strong>${state.colonyName}</strong> on <strong>${planet.name}</strong> is now habitable. Keep terraforming to reach Starfleet Hub status.`;
  }
  modal?.classList.add('open');
}

export function updateEventBanner(state) {
  const banner = document.getElementById('event-banner');
  const log = document.getElementById('colony-log');
  if (!state) return;
  const msg = getEventMessage(state);
  if (banner) {
    if (msg) {
      banner.textContent = msg;
      banner.classList.add('active');
      banner.classList.toggle('victory', state.planetComplete);
      banner.classList.toggle('storm', !!state.activeEvent);
    } else {
      banner.classList.remove('active', 'storm', 'victory');
    }
  }
  if (log && state.log?.length) {
    log.innerHTML = state.log.slice(0, 5).map((e) => `<li>${e.msg}</li>`).join('');
  }
}

export function updateHUD(state) {
  syncTerraformDisplay(state);
  const planet = getPlanet(state.planetId);
  setText('hud-colony', state.colonyName);
  setText('hud-planet', planet.name);
  setText('res-credits', Math.floor(state.credits));
  setText('res-minerals', Math.floor(state.minerals));
  const power = getPowerStats(state);
  const netLabel = power.net >= 0 ? `+${Math.round(power.net)}` : `${Math.round(power.net)}`;
  const energyEl = document.getElementById('res-energy');
  const energyPill = energyEl?.closest('.res-pill');
  if (energyEl) {
    energyEl.textContent = `${Math.floor(power.stored)}/${power.cap} (${netLabel})`;
    energyEl.title = `Stored ${Math.floor(power.stored)}/${power.cap} · Gen +${Math.round(power.gen)} · Demand −${Math.round(power.use)}`;
  }
  energyPill?.classList.toggle('power-deficit', power.gen > 0 && power.net < 0);
  energyPill?.classList.toggle('power-surplus', power.net > 0);
  setText('res-pop', `${Math.floor(state.population)}/${state.popCap}`);
  setText('res-oxygen', `${Math.floor(state.oxygen)}%`);
  setText('res-food', `${Math.floor(state.food)}%`);

  const fleet = getFleetCount(state);
  const cap = getFleetCap(state);
  const fleetEl = document.getElementById('res-fleet');
  if (fleetEl) fleetEl.textContent = cap > 0 ? `${fleet}/${cap}` : '—';

  const stage = getStage(state.terraformStage);
  const tfLabel = document.getElementById('terraform-stage-name');
  const tfPct = document.getElementById('terraform-pct');
  const tfBar = document.getElementById('terraform-bar');
  if (tfLabel) tfLabel.textContent = state.planetComplete ? 'Starfleet Hub' : `${stage.icon} ${stage.name}`;
  if (tfPct) tfPct.textContent = state.planetComplete ? 'COMPLETE ✦' : `${state.terraformStageProgress.toFixed(1)}%`;
  if (tfBar) {
    tfBar.style.width = `${state.terraformStageProgress}%`;
    tfBar.classList.toggle('complete', state.terraformStage >= 5);
  }
  const globalEl = document.getElementById('terraform-global');
  if (globalEl) {
    const overall = getTotalProgress(state.terraformStage, state.terraformStageProgress);
    globalEl.textContent = state.planetComplete ? 'Hub Online' : `Overall ${overall.toFixed(0)}%`;
  }
  updateStageTimeline(state);
}

export function updatePlanetCard(planet, colonyName) {
  setText('select-planet-name', planet?.name || '—');
  setText('select-planet-desc', planet?.tagline || '');
  setText('select-difficulty', planet?.difficulty || '');
  setText('colony-name-input', colonyName || 'Outpost Alpha');
}

export function updateBuildPanel(state, selectedBuild) {
  if (!state) return;
  document.querySelectorAll('.build-btn').forEach((btn) => {
    const id = btn.dataset.build;
    const def = BUILDINGS[id];
    const unlocked = isBuildingUnlocked(state, id);
    const afford = canAfford(state, def.cost);
    const lock = getBuildingLockReason(state, id);
    btn.classList.toggle('active', id === selectedBuild);
    btn.classList.toggle('disabled', !afford && unlocked);
    btn.classList.toggle('locked', !unlocked);
    btn.title = lock ? `${def.desc} — 🔒 ${lock}` : def.desc;
  });
  const hint = document.getElementById('build-hint');
  if (!hint) return;
  if (!selectedBuild) hint.textContent = 'Select structure → click cyan rings';
  else if (!isBuildingUnlocked(state, selectedBuild)) hint.textContent = `🔒 ${getBuildingLockReason(state, selectedBuild)}`;
  else if (!canAfford(state, BUILDINGS[selectedBuild].cost)) hint.textContent = 'Need more resources';
  else hint.textContent = `Place ${BUILDINGS[selectedBuild].name} on cyan ring`;
}

export function updateExploreGrid(state) {
  const grid = document.getElementById('explore-grid');
  if (!grid) return;
  grid.innerHTML = '';
  state.sectors.forEach((s) => {
    const cell = document.createElement('button');
    cell.className = 'explore-cell';
    if (s.revealed) {
      cell.classList.add('revealed');
      if (s.anomaly) cell.classList.add('anomaly');
      cell.textContent = s.anomaly ? '!' : '✓';
    } else {
      cell.textContent = '?';
      cell.addEventListener('click', () => grid.dispatchEvent(new CustomEvent('explore-sector', { detail: s.id })));
    }
    grid.appendChild(cell);
  });
}

export function toast(msg, ms = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) {
    if (el.tagName === 'INPUT') el.value = val;
    else el.textContent = val;
  }
}