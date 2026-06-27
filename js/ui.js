import { BUILDINGS, BUILD_ORDER, BUILD_CATEGORIES } from './buildings.js';
import { getPlanet } from './planets.js';
import { canAfford, getEventMessage, isBuildingUnlocked, getBuildingLockReason, getFleetCount, getFleetCap } from './game-state.js';

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
  document.getElementById('btn-fps')?.addEventListener('click', () => handlers.onToggleFPS?.());
  document.getElementById('btn-build-toggle')?.addEventListener('click', () => togglePanel('build-panel'));
  document.getElementById('btn-explore-toggle')?.addEventListener('click', () => togglePanel('explore-panel'));
  document.getElementById('fab-build')?.addEventListener('click', () => openPanel('build-panel'));
  document.getElementById('btn-victory-close')?.addEventListener('click', () => {
    document.getElementById('victory-modal')?.classList.remove('open');
  });

  buildBuildList(handlers.onSelectBuild);
  document.getElementById('explore-btn')?.addEventListener('click', () => handlers.onExplore?.());

  if (window.innerWidth < 768) {
    document.getElementById('build-panel')?.classList.add('collapsed');
  }

  return { show, updateHUD, updatePlanetCard, updateBuildPanel, updateExploreGrid, updateEventBanner, showVictory, toast };
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
    btn.title = def.desc;
    btn.addEventListener('click', () => onSelect?.(id));
    list.appendChild(btn);
  });
}

function togglePanel(id) {
  document.getElementById(id)?.classList.toggle('collapsed');
}

function openPanel(id) {
  const el = document.getElementById(id);
  el?.classList.remove('collapsed');
  if (id === 'build-panel') document.getElementById('explore-panel')?.classList.add('collapsed');
}

export function showVictory(state) {
  const modal = document.getElementById('victory-modal');
  const msg = document.getElementById('victory-msg');
  const planet = getPlanet(state.planetId);
  if (msg) {
    msg.innerHTML = `<strong>${state.colonyName}</strong> has fully terraformed <strong>${planet.name}</strong>.<br><br>
      🎁 Bonus: ₡5,000 · ⛏1,000 · +50 pop cap<br>
      🚀 All Starfleet buildings unlocked<br>
      🌲 Forests spread across the surface`;
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
      banner.classList.add('active', state.terraformComplete ? 'victory' : 'storm');
    } else {
      banner.classList.remove('active', 'storm', 'victory');
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

  const fleet = getFleetCount(state);
  const fleetCap = getFleetCap(state);
  const fleetEl = document.getElementById('res-fleet');
  if (fleetEl) fleetEl.textContent = fleetCap > 0 ? `${fleet}/${fleetCap}` : '—';

  const tf = document.getElementById('terraform-bar');
  const tfLabel = document.getElementById('terraform-pct');
  if (tf) {
    tf.style.width = `${state.terraform}%`;
    tf.classList.toggle('complete', state.terraformComplete);
  }
  if (tfLabel) {
    tfLabel.textContent = state.terraformComplete ? 'COMPLETE ✓' : `${state.terraform.toFixed(2)}%`;
    tfLabel.classList.toggle('complete', state.terraformComplete);
  }
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
    const unlocked = isBuildingUnlocked(state, id);
    const afford = canAfford(state, def.cost);
    const lock = getBuildingLockReason(state, id);
    btn.classList.toggle('active', id === selectedBuild);
    btn.classList.toggle('disabled', !afford && unlocked);
    btn.classList.toggle('locked', !unlocked);
    btn.disabled = false;
    if (lock) btn.title = `${def.desc} — 🔒 ${lock}`;
    else btn.title = def.desc;
  });
  const hint = document.getElementById('build-hint');
  if (hint) {
    if (!selectedBuild) {
      hint.textContent = 'Tap a structure, then click cyan rings on terrain';
    } else if (!isBuildingUnlocked(state, selectedBuild)) {
      hint.textContent = `🔒 ${getBuildingLockReason(state, selectedBuild)}`;
    } else if (!canAfford(state, BUILDINGS[selectedBuild].cost)) {
      hint.textContent = `Need ₡${BUILDINGS[selectedBuild].cost.credits} · ⛏${BUILDINGS[selectedBuild].cost.minerals}`;
    } else {
      hint.textContent = `Click cyan ring to place ${BUILDINGS[selectedBuild].name}`;
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
        grid.dispatchEvent(new CustomEvent('explore-sector', { detail: s.id }));
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