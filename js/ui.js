import { BUILDINGS, BUILD_ORDER } from './buildings.js';
import { getPlanet } from './planets.js';
import { canAfford, getEventMessage } from './game-state.js';

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

  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    handlers.onNewGame?.();
    show('select');
  });
  document.getElementById('btn-continue')?.addEventListener('click', () => handlers.onContinue?.());
  document.getElementById('btn-select-back')?.addEventListener('click', () => show('title'));
  document.getElementById('btn-launch')?.addEventListener('click', () => handlers.onLaunch?.());
  document.getElementById('btn-pause')?.addEventListener('click', () => handlers.onPause?.());
  document.getElementById('btn-menu')?.addEventListener('click', () => handlers.onMenu?.());

  const buildList = document.getElementById('build-list');
  BUILD_ORDER.forEach((id) => {
    const def = BUILDINGS[id];
    const btn = document.createElement('button');
    btn.className = 'build-btn';
    btn.dataset.build = id;
    btn.innerHTML = `<span class="build-icon">${def.icon}</span><span class="build-name">${def.name}</span><span class="build-cost">₡${def.cost.credits} · ⛏${def.cost.minerals}</span>`;
    btn.title = def.desc;
    btn.addEventListener('click', () => handlers.onSelectBuild?.(id));
    buildList?.appendChild(btn);
  });

  document.getElementById('explore-btn')?.addEventListener('click', () => handlers.onExplore?.());

  return { show, updateHUD, updatePlanetCard, updateBuildPanel, updateExploreGrid, updateEventBanner, toast };
}

export function updateEventBanner(state) {
  const banner = document.getElementById('event-banner');
  const log = document.getElementById('colony-log');
  if (!state) return;

  const msg = getEventMessage(state);
  if (banner) {
    if (msg) {
      banner.textContent = msg;
      banner.classList.add('active', 'storm');
    } else {
      banner.classList.remove('active', 'storm');
      banner.textContent = '';
    }
  }

  if (log && state.log?.length) {
    log.innerHTML = state.log.slice(0, 4).map((e) => `<li>${e.msg}</li>`).join('');
  }
}

export function updateHUD(state) {
  const planet = getPlanet(state.planetId);
  setText('hud-colony', state.colonyName);
  setText('hud-planet', planet.name);
  setText('res-credits', Math.floor(state.credits));
  setText('res-minerals', Math.floor(state.minerals));
  setText('res-energy', `${Math.floor(state.energy)}/${state.energyCap}`);
  setText('res-pop', `${Math.floor(state.population)}/${state.popCap}`);
  setText('res-oxygen', `${Math.floor(state.oxygen)}%`);
  setText('res-food', `${Math.floor(state.food)}%`);

  const tf = document.getElementById('terraform-bar');
  const tfLabel = document.getElementById('terraform-pct');
  if (tf) tf.style.width = `${state.terraform}%`;
  if (tfLabel) tfLabel.textContent = `${state.terraform.toFixed(2)}%`;
}

export function updatePlanetCard(planet, colonyName) {
  setText('select-planet-name', planet?.name || '—');
  setText('select-planet-desc', planet?.tagline || '');
  setText('select-difficulty', planet?.difficulty || '');
  setText('colony-name-input', colonyName || 'Outpost Alpha');
  const preview = document.getElementById('planet-preview-swatch');
  if (preview && planet) preview.style.background = planet.accent;
}

export function updateBuildPanel(state, selectedBuild) {
  if (!state) return;
  document.querySelectorAll('.build-btn').forEach((btn) => {
    const id = btn.dataset.build;
    const def = BUILDINGS[id];
    const afford = canAfford(state, def.cost);
    btn.classList.toggle('active', id === selectedBuild);
    btn.classList.toggle('disabled', !afford);
    btn.disabled = false;
  });
  const hint = document.getElementById('build-hint');
  if (hint) {
    if (!selectedBuild) {
      hint.textContent = 'Select a structure, then click the terrain';
    } else if (!canAfford(state, BUILDINGS[selectedBuild].cost)) {
      hint.textContent = `Need ₡${BUILDINGS[selectedBuild].cost.credits} · ⛏${BUILDINGS[selectedBuild].cost.minerals} — gather more resources`;
    } else {
      hint.textContent = `Click terrain to place ${BUILDINGS[selectedBuild].name}`;
    }
  }
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
      cell.title = s.anomaly || 'Surveyed';
    } else {
      cell.textContent = '?';
      cell.title = `Explore — ₡${80 + state.explored * 20}`;
      cell.addEventListener('click', () => {
        const ev = new CustomEvent('explore-sector', { detail: s.id });
        grid.dispatchEvent(ev);
      });
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