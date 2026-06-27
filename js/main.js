import { PLANETS, getPlanet } from './planets.js';
import { PlanetSelectView } from './planet-select.js';
import { ColonyEngine } from './colony-engine.js';
import { BUILDINGS } from './buildings.js';
import {
  newColony, placeBuilding, exploreSector, simulateTick, saveGame, loadGame,
  canAfford, isBuildingUnlocked, getBuildingLockReason
} from './game-state.js';
import {
  bindUI, updateHUD, updatePlanetCard, updateBuildPanel, updateExploreGrid,
  updateEventBanner, showVictory, toast
} from './ui.js';

let selectView = null;
let colonyEngine = null;
let state = null;
let selectedPlanetId = 'mars';
let selectedBuild = null;
let rafId = null;
let lastTick = 0;
let ui = null;

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
    onExplore: () => {
      const panel = document.getElementById('explore-panel');
      panel?.classList.toggle('open');
      panel?.classList.toggle('collapsed', false);
    }
  });

  ui.show('title');
  const saved = loadGame();
  const contBtn = document.getElementById('btn-continue');
  if (contBtn) contBtn.style.display = saved ? '' : 'none';
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
  if (cards) {
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
  }

  canvas.onmousemove = (e) => {
    const id = selectView?.pick(e.clientX, e.clientY);
    if (id) {
      selectView.setFeatured(id);
      selectedPlanetId = id;
      updatePlanetCard(getPlanet(id), document.getElementById('colony-name-input')?.value);
      document.querySelectorAll('.planet-card').forEach((c) => {
        c.classList.toggle('active', c.querySelector('strong')?.textContent === getPlanet(id).name);
      });
    }
  };

  canvas.onclick = (e) => {
    const id = selectView?.pick(e.clientX, e.clientY);
    if (!id) return;
    selectedPlanetId = id;
    selectView.setFeatured(id);
    updatePlanetCard(getPlanet(id), document.getElementById('colony-name-input')?.value);
  };

  ui.show('select');
  requestAnimationFrame(() => selectView?.resize());

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
  const name = document.getElementById('colony-name-input')?.value?.trim() || 'Outpost Alpha';
  if (selectView) { selectView.dispose(); selectView = null; }
  cancelAnimationFrame(rafId);

  state = newColony(selectedPlanetId, name);
  selectedBuild = null;
  ui.show('colony');
  beginColonyAfterLayout();
  toast(`Colony established on ${getPlanet(selectedPlanetId).name}`);
  setTimeout(() => toast('Build Habitat & Terraform Plant — reach 100% to win!'), 3200);
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
  requestAnimationFrame(() => requestAnimationFrame(() => startColonyLoop()));
}

function setupColonyInput(canvas) {
  canvas.onpointermove = (e) => {
    if (selectedBuild && colonyEngine?.viewMode === 'orbit') {
      colonyEngine.setBuildPreview(selectedBuild, e.clientX, e.clientY);
    }
    if (colonyEngine?.viewMode === 'fps' && e.buttons === 1) {
      colonyEngine.setMobileLook(e.movementX, e.movementY);
    }
  };

  canvas.onclick = (e) => {
    if (colonyEngine?.viewMode === 'fps') {
      colonyEngine.requestPointerLock();
      return;
    }
    if (!selectedBuild || !state) return;
    tryPlaceBuilding(e.clientX, e.clientY);
  };

  window.addEventListener('keydown', (e) => {
    if (!colonyEngine) return;
    colonyEngine.setKey(e.code, true);
    if (e.code === 'KeyV') toggleFPS();
  });
  window.addEventListener('keyup', (e) => colonyEngine?.setKey(e.code, false));

  const joy = document.getElementById('mobile-joy');
  const knob = document.getElementById('mobile-joy-knob');
  if (joy && knob) {
    let joyId = null;
    let joyOrigin = { x: 0, y: 0 };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      joyOrigin = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        const dx = t.clientX - joyOrigin.x;
        const dy = t.clientY - joyOrigin.y;
        const len = Math.hypot(dx, dy) || 1;
        const clamp = Math.min(40, len);
        knob.style.transform = `translate(${dx / len * clamp}px, ${dy / len * clamp}px)`;
        colonyEngine?.setMobileMove(dx / len * (clamp / 40), dy / len * (clamp / 40));
      }
    }, { passive: false });
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null;
        knob.style.transform = '';
        colonyEngine?.setMobileMove(0, 0);
      }
    };
    joy.addEventListener('touchend', endJoy);
    joy.addEventListener('touchcancel', endJoy);
  }

  let lookId = null;
  let lookLast = { x: 0, y: 0 };
  canvas.addEventListener('touchstart', (e) => {
    if (colonyEngine?.viewMode !== 'fps') return;
    const t = e.changedTouches[0];
    if (t.clientX > window.innerWidth * 0.45) {
      lookId = t.identifier;
      lookLast = { x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (lookId == null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      colonyEngine?.setMobileLook(t.clientX - lookLast.x, t.clientY - lookLast.y);
      lookLast = { x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { lookId = null; });
}

function tryPlaceBuilding(clientX, clientY) {
  const pos = colonyEngine.pickGround(clientX, clientY);
  if (!pos) {
    toast('Click a cyan ring — not the landing pad');
    return;
  }
  if (!isBuildingUnlocked(state, selectedBuild)) {
    toast(`🔒 ${getBuildingLockReason(state, selectedBuild)}`);
    return;
  }
  const def = BUILDINGS[selectedBuild];
  if (!canAfford(state, def?.cost)) {
    toast(`Need ₡${def.cost.credits} · ⛏${def.cost.minerals}`);
    return;
  }
  if (placeBuilding(state, selectedBuild, pos.x, pos.z)) {
    toast(`${def.name} constructed`);
    selectedBuild = null;
    colonyEngine.setBuildMode(false);
    colonyEngine.setBuildPreview(null);
    colonyEngine.syncState(state);
    updateBuildPanel(state, null);
    updateHUD(state);
    saveGame(state);
  } else {
    toast('Too close to another building');
  }
}

function toggleFPS() {
  if (!colonyEngine) return;
  const mode = colonyEngine.toggleViewMode();
  selectedBuild = null;
  colonyEngine.setBuildPreview(null);
  updateBuildPanel(state, null);
  const btn = document.getElementById('btn-fps');
  const joy = document.getElementById('mobile-controls');
  if (btn) btn.textContent = mode === 'fps' ? '🛰' : '👁';
  if (joy) joy.classList.toggle('visible', mode === 'fps');
  toast(mode === 'fps' ? 'First-person — WASD move · V to exit' : 'Orbit view restored');
  if (mode === 'fps') colonyEngine.requestPointerLock();
}

function startColonyLoop() {
  const canvas = document.getElementById('colony-canvas');
  if (!canvas) return;
  colonyEngine?.dispose();
  colonyEngine = new ColonyEngine(canvas, state.planetId);
  colonyEngine.resize();
  setupColonyInput(canvas);

  const grid = document.getElementById('explore-grid');
  grid?.addEventListener('explore-sector', (e) => {
    if (exploreSector(state, e.detail)) {
      toast('Sector explored!');
      updateExploreGrid(state);
      saveGame(state);
    } else toast('Not enough credits');
  });

  updateHUD(state);
  updateBuildPanel(state, selectedBuild);
  updateExploreGrid(state);
  updateEventBanner(state);
  if (state.terraformComplete) showVictory(state);
  lastTick = performance.now();

  let renderT = 0;
  function loop(now) {
    if (!colonyEngine || !state) return;
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    renderT += dt;
    if (dt > 0) {
      const prevStorm = state.activeEvent?.type;
      const { terraformJustComplete } = simulateTick(state, dt);
      if (state.activeEvent?.type === 'dust_storm' && prevStorm !== 'dust_storm') {
        toast('Dust storm — solar weakened');
      }
      if (terraformJustComplete) {
        showVictory(state);
        toast('🌍 TERRAFORM COMPLETE — Planet is habitable!');
        colonyEngine.syncState(state);
        saveGame(state);
      }
      colonyEngine.syncState(state);
      updateHUD(state);
      updateBuildPanel(state, selectedBuild);
      updateEventBanner(state);
      if (state.tick % 30 < dt) saveGame(state);
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