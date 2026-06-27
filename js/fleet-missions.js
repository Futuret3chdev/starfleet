/** Starfleet orbit & deep-space mission catalogue. */
export const FLEET_MISSIONS = [
  {
    id: 'low_orbit',
    name: 'Low Orbit Survey',
    icon: '🛰',
    duration: 25,
    cost: { credits: 40 },
    rewards: { credits: 180, minerals: 30 },
    minStage: 1,
    desc: 'Scan terrain from orbit'
  },
  {
    id: 'satellite_deploy',
    name: 'Deploy Satellites',
    icon: '📡',
    duration: 35,
    cost: { credits: 60, minerals: 20 },
    rewards: { credits: 250, terraform: 2 },
    minStage: 2,
    desc: 'Weather & comms network'
  },
  {
    id: 'asteroid_run',
    name: 'Asteroid Mining Run',
    icon: '☄️',
    duration: 50,
    cost: { credits: 100, minerals: 30 },
    rewards: { minerals: 200, credits: 150 },
    minStage: 3,
    desc: 'Harvest nearby asteroid belt'
  },
  {
    id: 'moon_relay',
    name: 'Lunar Relay',
    icon: '🌙',
    duration: 55,
    cost: { credits: 120 },
    rewards: { credits: 400, minerals: 60, terraform: 3 },
    minStage: 4,
    desc: 'Establish moon communications'
  },
  {
    id: 'deep_probe',
    name: 'Deep Space Probe',
    icon: '🌌',
    duration: 70,
    cost: { credits: 180, minerals: 50 },
    rewards: { credits: 600, minerals: 100 },
    minStage: 4,
    desc: 'Probe outer system anomalies'
  },
  {
    id: 'colony_convoy',
    name: 'Colony Convoy',
    icon: '🚀',
    duration: 80,
    cost: { credits: 250, minerals: 80 },
    rewards: { credits: 500, popCap: 25 },
    minStage: 5,
    desc: 'Import settlers from Earth'
  },
  {
    id: 'system_patrol',
    name: 'System Patrol',
    icon: '⚔️',
    duration: 45,
    cost: { credits: 150 },
    rewards: { credits: 450, minerals: 50 },
    minStage: 5,
    desc: 'Secure trade lanes'
  },
  {
    id: 'interstellar',
    name: 'Interstellar Jump',
    icon: '✦',
    duration: 120,
    cost: { credits: 400, minerals: 150 },
    rewards: { credits: 1500, minerals: 300, terraform: 8 },
    minStage: 6,
    desc: 'First jump to neighboring star'
  }
];

export function getMission(id) {
  return FLEET_MISSIONS.find((m) => m.id === id);
}