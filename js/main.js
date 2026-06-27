import { PLANETS, getPlanet } from './planets.js';
import { PlanetSelectView } from './planet-select.js';
import { ColonyEngine } from './colony-engine.js';
import {
  newColony, placeBuilding, exploreSector, simulateTick, saveGame, loadGame
} from './game-state.js';
import { bindUI, updateHUD, updatePlanetCard, updateBuildPanel, updateExploreGrid, toast } from './ui.js';

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
  selectView = new PlanetSelectView(canvas);
  selectedPlanetId = 'mars';
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
        selectView?.setHover(p.id);
      });
      cards.appendChild(card);
    });
  }

  canvas.onmousemove = (e) => {
    const id = selectView?.pick(e.clientX, e.clientY);
    if (id) {
      selectView.setHover(id);
      selectedPlanetId = id;
      const p = getPlanet(id);
      updatePlanetCard(p, document.getElementById('colony-name-input')?.value);
      document.querySelectorAll('.planet-card').forEach((c) => {
        c.classList.toggle('active', c.querySelector('strong')?.textContent === p.name);
      });
    }
  };

  ui.show('select');
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
  startColonyLoop();
  ui.show('colony');
  toast(`Colony established on ${getPlanet(selectedPlanetId).name}`);
}

function continueGame() {
  const saved = loadGame();
  if (!saved) return;
  state = saved;
  selectedPlanetId = state.planetId;
  selectedBuild = null;
  startColonyLoop();
  ui.show('colony');
  toast(`Welcome back, Commander`);
}

function startColonyLoop() {
  const canvas = document.getElementById('colony-canvas');
  colonyEngine = new ColonyEngine(canvas, state.planetId);

  canvas.onclick = (e) => {
    if (!selectedBuild || !state) return;
    const pos = colonyEngine.pickGround(e.clientX, e.clientY);
    if (!pos) return;
    if (placeBuilding(state, selectedBuild, pos.x, pos.z)) {
      toast(`${selectedBuild} constructed`);
      selectedBuild = null;
      updateBuildPanel(state, null);
      saveGame(state);
    } else {
      toast('Cannot build here — check resources & spacing');
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
  lastTick = performance.now();

  function loop(now) {
    if (!colonyEngine || !state) return;
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    if (dt > 0) {
      simulateTick(state, dt);
      colonyEngine.syncState(state);
      updateHUD(state);
      if (state.tick % 30 < dt) saveGame(state);
    }
    colonyEngine.render();
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