import { PLANETS, getPlanet } from './planets.js';
import { PlanetSelectView } from './planet-select.js';
import { ColonyEngine } from './colony-engine.js';
import { BUILDINGS } from './buildings.js';
import {
  newColony, placeBuilding, exploreSector, simulateTick, saveGame, loadGame, canAfford
} from './game-state.js';
import { bindUI, updateHUD, updatePlanetCard, updateBuildPanel, updateExploreGrid, updateEventBanner, toast } from './ui.js';

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
    onSelectBuild: (id) => {
      selectedBuild = selectedBuild === id ? null : id;
      updateBuildPanel(state, selectedBuild);
    },
    onExplore: () => document.getElementById('explore-panel')?.classList.toggle('open')
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
      const p = getPlanet(id);
      updatePlanetCard(p, document.getElementById('colony-name-input')?.value);
      document.querySelectorAll('.planet-card').forEach((c) => {
        c.classList.toggle('active', c.querySelector('strong')?.textContent === p.name);
      });
    }
  };

  canvas.onclick = (e) => {
    const id = selectView?.pick(e.clientX, e.clientY);
    if (id) {
      selectedPlanetId = id;
      selectView.setFeatured(id);
      const p = getPlanet(id);
      updatePlanetCard(p, document.getElementById('colony-name-input')?.value);
      document.querySelectorAll('.planet-card').forEach((c) => {
        c.classList.toggle('active', c.querySelector('strong')?.textContent === p.name);
      });
    }
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
  setTimeout(() => toast('Starter solar is online — build Habitat, then Mine & Garage'), 3200);
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
    requestAnimationFrame(() => startColonyLoop());
  });
}

function startColonyLoop() {
  const canvas = document.getElementById('colony-canvas');
  if (!canvas) return;
  colonyEngine?.dispose();
  colonyEngine = new ColonyEngine(canvas, state.planetId);
  colonyEngine.resize();

  let pointerDown = null;
  canvas.onpointerdown = (e) => {
    if (e.button !== 0) return;
    pointerDown = { x: e.clientX, y: e.clientY };
    colonyEngine.setBuildPreview(selectedBuild, e.clientX, e.clientY);
  };
  canvas.onpointermove = (e) => {
    if (selectedBuild) colonyEngine.setBuildPreview(selectedBuild, e.clientX, e.clientY);
  };
  canvas.onpointerup = (e) => {
    if (e.button !== 0 || !pointerDown) return;
    const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
    pointerDown = null;
    if (moved > 8) return;
    if (!selectedBuild || !state) return;
    const pos = colonyEngine.pickGround(e.clientX, e.clientY);
    if (!pos) {
      toast('Click open terrain away from the landing pad');
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
      colonyEngine.setBuildPreview(null);
      colonyEngine.syncState(state);
      updateBuildPanel(state, null);
      updateHUD(state);
      saveGame(state);
    } else {
      toast('Too close to another building — try further out');
    }
  };

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
  lastTick = performance.now();

  let renderT = 0;
  function loop(now) {
    if (!colonyEngine || !state) return;
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    renderT += dt;
    if (dt > 0) {
      const prevEvent = state.activeEvent?.type;
      simulateTick(state, dt);
      if (state.activeEvent?.type === 'dust_storm' && prevEvent !== 'dust_storm') {
        toast('Dust storm incoming — solar arrays weakened');
      }
      colonyEngine.syncState(state);
      updateHUD(state);
      updateEventBanner(state);
      if (state.tick % 30 < dt) saveGame(state);
    }
    colonyEngine.render(renderT);
    rafId = requestAnimationFrame(loop);
  }
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function togglePause() {
  if (!state) return;
  state.paused = !state.paused;
  document.getElementById('btn-pause').textContent = state.paused ? '▶' : '⏸';
  toast(state.paused ? 'Simulation paused' : 'Simulation resumed');
}

function stopColony() {
  cancelAnimationFrame(rafId);
  colonyEngine?.dispose();
  colonyEngine = null;
  state = null;
}

init();