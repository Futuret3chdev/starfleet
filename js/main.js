import { PLANETS, getPlanet } from './planets.js?v=16';
import { PlanetSelectView } from './planet-select.js?v=16';
import { ColonyEngine } from './colony-engine.js?v=16';
import { BUILDINGS } from './buildings.js?v=16';
import { getStage } from './terraform-stages.js?v=16';
import { getMission } from './fleet-missions.js?v=16';
import {
  newColony, placeBuilding, exploreSector, simulateTick, saveGame, loadGame,
  canAfford, isBuildingUnlocked, getBuildingLockReason, launchFleetMission, getIdleShips
} from './game-state.js?v=16';
import {
  bindUI, updateHUD, updatePlanetCard, updateBuildPanel, updateExploreGrid,
  updateEventBanner, updateFleetPanel, showVictory, showStageAdvance, toast
} from './ui.js?v=16';

let selectView = null, colonyEngine = null, state = null;
let selectedPlanetId = 'mars', selectedBuild = null;
let rafId = null, lastTick = 0, ui = null;

function init() {
  ui = bindUI({
    onNewGame: () => startPlanetSelect(),
    onContinue: continueGame,
    onLaunch: launchColony,
    onPause: togglePause,
    onMenu: () => { stopColony(); ui.show('title'); },
    onToggleFPS: toggleFPS,
    onSelectBuild: (id) => {
      selectedBuild = selectedBuild === id ? null : id;
      colonyEngine?.setBuildMode(!!selectedBuild);
      colonyEngine?.setBuildPreview(selectedBuild || null);
      updateBuildPanel(state, selectedBuild);
    },
    onLaunchMission: launchMission,
    onExplore: () => document.getElementById('explore-panel')?.classList.toggle('open')
  });
  ui.show('title');
  document.getElementById('btn-continue').style.display = loadGame() ? '' : 'none';
}

function startPlanetSelect() {
  stopColony();
  const canvas = document.getElementById('select-canvas');
  if (!canvas) return;
  if (selectView) selectView.dispose();
  selectView = new PlanetSelectView(canvas);
  selectedPlanetId = 'mars';
  selectView.setFeatured(selectedPlanetId);
  updatePlanetCard(getPlanet(selectedPlanetId), 'Outpost Alpha');

  const cards = document.getElementById('planet-cards');
  cards.innerHTML = '';
  PLANETS.forEach((p) => {
    const card = document.createElement('button');
    card.className = 'planet-card' + (p.id === selectedPlanetId ? ' active' : '');
    card.innerHTML = `<strong>${p.name}</strong><small>${p.difficulty}</small>`;
    card.addEventListener('click', () => {
      selectedPlanetId = p.id;
      document.querySelectorAll('.planet-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      updatePlanetCard(p, document.getElementById('colony-name-input')?.value || 'Outpost Alpha');
      selectView?.setFeatured(p.id);
    });
    cards.appendChild(card);
  });

  canvas.onmousemove = (e) => {
    const id = selectView?.pick(e.clientX, e.clientY);
    if (id) { selectedPlanetId = id; selectView.setFeatured(id); updatePlanetCard(getPlanet(id), document.getElementById('colony-name-input')?.value); }
  };
  ui.show('select');
  requestAnimationFrame(() => selectView?.resize());
  [100, 400, 900].forEach((ms) => setTimeout(() => selectView?.resize(), ms));
  let t0 = performance.now();
  function loop(now) {
    if (!selectView) return;
    selectView.render((now - t0) * 0.001);
    rafId = requestAnimationFrame(loop);
  }
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function launchColony() {
  if (selectView) { selectView.dispose(); selectView = null; }
  cancelAnimationFrame(rafId);
  state = newColony(selectedPlanetId, document.getElementById('colony-name-input')?.value?.trim() || 'Outpost Alpha');
  selectedBuild = null;
  ui.show('colony');
  beginColonyAfterLayout();
  toast(`Colony established on ${getPlanet(selectedPlanetId).name}`);
  setTimeout(() => toast('7 terraform phases ahead — build, explore, launch fleets!'), 3000);
}

function continueGame() {
  const saved = loadGame();
  if (!saved) return;
  state = saved;
  selectedPlanetId = state.planetId;
  selectedBuild = null;
  ui.show('colony');
  beginColonyAfterLayout();
  toast('Welcome back, Commander');
}

function beginColonyAfterLayout() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startColonyLoop();
      [100, 400, 900].forEach((ms) => {
        setTimeout(() => colonyEngine?.resize(), ms);
      });
    });
  });
}

function launchMission(missionId) {
  if (!state) return;
  const mission = getMission(missionId);
  const idle = getIdleShips(state);
  if (!idle.length) { toast('No idle starships — build more at Shipyard'); return; }
  if (launchFleetMission(state, missionId, idle[0].id)) {
    toast(`${mission.name} launched — ship entering orbit`);
    const panel = document.getElementById('fleet-panel');
    panel?.classList.add('open');
    panel?.classList.remove('collapsed');
    updateFleetPanel(state);
    updateHUD(state);
    saveGame(state);
  } else {
    toast('Cannot launch — check phase unlock & resources');
  }
}

function setupColonyInput(canvas) {
  canvas.onpointermove = (e) => {
    if (selectedBuild && colonyEngine?.viewMode === 'orbit') colonyEngine.setBuildPreview(selectedBuild, e.clientX, e.clientY);
    if (colonyEngine?.viewMode === 'fps' && e.buttons === 1) colonyEngine.setMobileLook(e.movementX, e.movementY);
  };
  canvas.onclick = (e) => {
    if (colonyEngine?.viewMode === 'fps') { colonyEngine.requestPointerLock(); return; }
    if (!selectedBuild || !state) return;
    tryPlaceBuilding(e.clientX, e.clientY);
  };
  window.addEventListener('keydown', (e) => {
    colonyEngine?.setKey(e.code, true);
    if (e.code === 'KeyV') toggleFPS();
    if (e.code === 'KeyF') {
      const panel = document.getElementById('fleet-panel');
      panel?.classList.toggle('open');
      panel?.classList.remove('collapsed');
    }
  });
  window.addEventListener('keyup', (e) => colonyEngine?.setKey(e.code, false));
  setupMobileJoy();
}

function setupMobileJoy() {
  const joy = document.getElementById('mobile-joy');
  const knob = document.getElementById('mobile-joy-knob');
  if (!joy || !knob) return;
  let joyId = null, origin = { x: 0, y: 0 };
  joy.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joyId = t.identifier;
    origin = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  joy.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
      const len = Math.hypot(dx, dy) || 1, c = Math.min(40, len);
      knob.style.transform = `translate(${dx / len * c}px, ${dy / len * c}px)`;
      colonyEngine?.setMobileMove(dx / len * (c / 40), dy / len * (c / 40));
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyId = null; knob.style.transform = '';
      colonyEngine?.setMobileMove(0, 0);
    }
  };
  joy.addEventListener('touchend', end);
  joy.addEventListener('touchcancel', end);
}

function tryPlaceBuilding(clientX, clientY) {
  if (!colonyEngine?.pickGround) return;
  const pos = colonyEngine.pickGround(clientX, clientY);
  if (!pos) { toast('Click cyan ring — not landing pad'); return; }
  if (!isBuildingUnlocked(state, selectedBuild)) { toast(`🔒 ${getBuildingLockReason(state, selectedBuild)}`); return; }
  const def = BUILDINGS[selectedBuild];
  if (!canAfford(state, def?.cost)) { toast(`Need ₡${def.cost.credits} · ⛏${def.cost.minerals}`); return; }
  if (placeBuilding(state, selectedBuild, pos.x, pos.z)) {
    toast(`${def.name} built`);
    selectedBuild = null;
    colonyEngine.setBuildMode(false);
    colonyEngine.setBuildPreview(null);
    colonyEngine.syncState(state);
    updateBuildPanel(state, null);
    updateHUD(state);
    updateFleetPanel(state);
    saveGame(state);
  } else toast('Too close to another building');
}

function toggleFPS() {
  if (!colonyEngine) return;
  const mode = colonyEngine.toggleViewMode();
  selectedBuild = null;
  colonyEngine.setBuildPreview(null);
  updateBuildPanel(state, null);
  document.getElementById('btn-fps').textContent = mode === 'fps' ? '🛰' : '👁';
  document.getElementById('mobile-controls')?.classList.toggle('visible', mode === 'fps');
  toast(mode === 'fps' ? 'First-person — WASD · V exits' : 'Orbit view');
  if (mode === 'fps') colonyEngine.requestPointerLock();
}

function startColonyLoop() {
  const canvas = document.getElementById('colony-canvas');
  if (!canvas) return;
  colonyEngine?.dispose();
  colonyEngine = new ColonyEngine(canvas, state.planetId);
  colonyEngine.resize();
  setupColonyInput(canvas);

  document.getElementById('explore-grid')?.addEventListener('explore-sector', (e) => {
    if (exploreSector(state, e.detail)) { toast('Sector explored!'); updateExploreGrid(state); saveGame(state); }
    else toast('Not enough credits');
  });

  updateHUD(state);
  updateBuildPanel(state, selectedBuild);
  updateExploreGrid(state);
  updateEventBanner(state);
  updateFleetPanel(state);
  if (state.terraformStage >= 5) showVictory(state);
  lastTick = performance.now();

  let renderT = 0;
  function loop(now) {
    if (!colonyEngine || !state) return;
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    renderT += dt;
    if (dt > 0) {
      const result = simulateTick(state, dt);
      if (result.missionsComplete?.length) {
        result.missionsComplete.forEach((entry) => {
          toast(`✓ ${entry.mission.name} returned with rewards`);
        });
        saveGame(state);
      }
      if (result.stageAdvanced != null) {
        showStageAdvance(state, result.stageAdvanced);
        toast(`${getStage(result.stageAdvanced).icon} ${getStage(result.stageAdvanced).name} phase!`);
        if (result.stageAdvanced >= 5 && result.stageAdvanced < 6) showVictory(state);
        saveGame(state);
      }
      if (result.planetComplete) {
        showVictory(state);
        toast('✦ Starfleet Hub — interstellar era!');
        saveGame(state);
      }
      colonyEngine.syncState(state);
      updateHUD(state);
      updateBuildPanel(state, selectedBuild);
      updateEventBanner(state);
      updateFleetPanel(state);
      if (state.tick % 25 < dt) saveGame(state);
    }
    colonyEngine.render(renderT, dt);
    rafId = requestAnimationFrame(loop);
  }
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function togglePause() {
  if (!state) return;
  state.paused = !state.paused;
  document.getElementById('btn-pause').textContent = state.paused ? '▶' : '⏸';
  toast(state.paused ? 'Paused' : 'Resumed');
}

function stopColony() {
  cancelAnimationFrame(rafId);
  colonyEngine?.dispose();
  colonyEngine = null;
  state = null;
}

init();