/** Seven-phase planetary transformation — continues past first 100%. */
export const TERRAFORM_STAGES = [
  { id: 0, name: 'Barren', icon: '🏜', desc: 'Hostile dust & radiation', color: 0xc1440e },
  { id: 1, name: 'Atmosphere', icon: '🌫', desc: 'Breathable air forming', color: 0xa85a30 },
  { id: 2, name: 'Hydrosphere', icon: '💧', desc: 'Lakes, rivers & ice caps', color: 0x6a8a9a },
  { id: 3, name: 'Biosphere', icon: '🌿', desc: 'Forests & ecosystems spread', color: 0x4a8a4a },
  { id: 4, name: 'Habitable', icon: '🏙', desc: 'Cities & stable climate', color: 0x3d9a5a },
  { id: 5, name: 'Eden World', icon: '🌍', desc: 'Earth-like living planet', color: 0x2d8a6a },
  { id: 6, name: 'Starfleet Hub', icon: '✦', desc: 'Interstellar staging world', color: 0x1a6aaa }
];

export function getStage(id) {
  return TERRAFORM_STAGES[id] || TERRAFORM_STAGES[0];
}

export function getTotalProgress(stage, progress) {
  return Math.min(100, ((stage * 100 + progress) / (TERRAFORM_STAGES.length * 100)) * 100);
}

export function getVisualBlend(stage, progress) {
  const s = getStage(stage);
  const next = getStage(Math.min(stage + 1, TERRAFORM_STAGES.length - 1));
  const t = progress / 100;
  return { stage: s, next, t: stage >= 6 ? 1 : t, global: (stage + t) / (TERRAFORM_STAGES.length - 1) };
}

export function migrateLegacyTerraform(state) {
  if (state.terraformStage != null) return;
  const old = state.terraform ?? 0;
  if (state.terraformComplete || state.planetComplete) {
    state.terraformStage = 5;
    state.terraformStageProgress = 100;
    state.planetComplete = state.terraformComplete ?? false;
  } else {
    const total = old * (TERRAFORM_STAGES.length - 1) / 100;
    state.terraformStage = Math.min(5, Math.floor(total));
    state.terraformStageProgress = (total - state.terraformStage) * 100;
  }
  state.terraform = getTotalProgress(state.terraformStage, state.terraformStageProgress);
}