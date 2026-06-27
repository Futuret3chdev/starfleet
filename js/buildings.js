/** Colony structures — costs, outputs, terraform contribution. */
export const BUILDINGS = {
  habitat: {
    id: 'habitat',
    name: 'Habitat Dome',
    icon: '🏠',
    cost: { credits: 280, minerals: 50 },
    power: -6,
    popCap: 12,
    terraform: 0.04,
    desc: 'Pressurised living quarters — colonists & slow biosphere growth'
  },
  solar: {
    id: 'solar',
    name: 'Solar Array',
    icon: '☀️',
    cost: { credits: 150, minerals: 25 },
    power: 30,
    desc: 'Generates energy from local starlight'
  },
  mine: {
    id: 'mine',
    name: 'Auto-Mine',
    icon: '⛏️',
    cost: { credits: 500, minerals: 60 },
    power: -12,
    harvest: 6,
    desc: 'Extracts minerals from deposit nodes'
  },
  garage: {
    id: 'garage',
    name: 'Rover Garage',
    icon: '🚛',
    cost: { credits: 350, minerals: 100 },
    power: -6,
    truckCap: 2,
    desc: 'Deploys harvest trucks to resource nodes'
  },
  terraform: {
    id: 'terraform',
    name: 'Terraform Plant',
    icon: '🌱',
    cost: { credits: 450, minerals: 100 },
    power: -14,
    terraform: 0.35,
    desc: 'Raises atmosphere, temperature & biosphere — needs power'
  },
  research: {
    id: 'research',
    name: 'Research Lab',
    icon: '🔬',
    cost: { credits: 600, minerals: 120 },
    power: -10,
    exploreBoost: 1.5,
    desc: 'Accelerates sector exploration scans'
  },
  depot: {
    id: 'depot',
    name: 'Supply Depot',
    icon: '📦',
    cost: { credits: 300, minerals: 90 },
    power: -4,
    storage: 500,
    desc: 'Stores harvested minerals & supplies'
  }
};

export const BUILD_ORDER = ['habitat', 'solar', 'mine', 'garage', 'terraform', 'research', 'depot'];