/** Colony structures — costs, outputs, terraform & unlock requirements. */
export const BUILDINGS = {
  habitat: {
    id: 'habitat',
    name: 'Habitat Dome',
    icon: '🏠',
    category: 'colony',
    cost: { credits: 280, minerals: 50 },
    power: -6,
    popCap: 12,
    terraform: 0.04,
    desc: 'Pressurised living quarters — colonists & biosphere growth'
  },
  solar: {
    id: 'solar',
    name: 'Solar Array',
    icon: '☀️',
    category: 'colony',
    cost: { credits: 150, minerals: 25 },
    power: 30,
    desc: 'Generates energy from local starlight'
  },
  farm: {
    id: 'farm',
    name: 'Agri-Dome',
    icon: '🌾',
    category: 'colony',
    cost: { credits: 320, minerals: 60 },
    power: -5,
    foodRate: 1.5,
    terraform: 0.06,
    desc: 'Hydroponic food production & green cover'
  },
  mine: {
    id: 'mine',
    name: 'Auto-Mine',
    icon: '⛏️',
    category: 'colony',
    cost: { credits: 500, minerals: 60 },
    power: -12,
    harvest: 6,
    desc: 'Extracts minerals from deposit nodes'
  },
  garage: {
    id: 'garage',
    name: 'Rover Garage',
    icon: '🚛',
    category: 'colony',
    cost: { credits: 350, minerals: 100 },
    power: -6,
    truckCap: 2,
    desc: 'Deploys harvest rovers to resource nodes'
  },
  depot: {
    id: 'depot',
    name: 'Supply Depot',
    icon: '📦',
    category: 'colony',
    cost: { credits: 300, minerals: 90 },
    power: -4,
    storage: 500,
    desc: 'Stores harvested minerals & supplies'
  },
  terraform: {
    id: 'terraform',
    name: 'Terraform Plant',
    icon: '🌱',
    category: 'terraform',
    cost: { credits: 450, minerals: 100 },
    power: -14,
    terraform: 0.35,
    desc: 'Accelerates atmosphere & biosphere — needs power'
  },
  hydroponics: {
    id: 'hydroponics',
    name: 'Hydroponics Bay',
    icon: '💧',
    category: 'terraform',
    cost: { credits: 400, minerals: 80 },
    power: -8,
    foodRate: 2.5,
    terraform: 0.15,
    requiresTerraform: 15,
    desc: 'Advanced food & terraforming — unlocks at 15%'
  },
  research: {
    id: 'research',
    name: 'Research Lab',
    icon: '🔬',
    category: 'science',
    cost: { credits: 600, minerals: 120 },
    power: -10,
    exploreBoost: 1.5,
    desc: 'Accelerates sector exploration scans'
  },
  comms: {
    id: 'comms',
    name: 'Comm Array',
    icon: '📡',
    category: 'science',
    cost: { credits: 450, minerals: 70 },
    power: -7,
    creditBoost: 1.5,
    desc: 'Starfleet comms — boosts trade income'
  },
  spaceport: {
    id: 'spaceport',
    name: 'Spaceport',
    icon: '🛬',
    category: 'starfleet',
    cost: { credits: 700, minerals: 150 },
    power: -10,
    fleetCap: 1,
    requiresTerraform: 20,
    desc: 'Shuttle landing — unlocks at 20% terraform'
  },
  starfleet_yard: {
    id: 'starfleet_yard',
    name: 'Starfleet Shipyard',
    icon: '🏭',
    category: 'starfleet',
    cost: { credits: 1500, minerals: 350 },
    power: -22,
    fleetCap: 2,
    requiresTerraform: 35,
    requires: 'spaceport',
    desc: 'Build starships — needs Spaceport & 35% terraform'
  },
  starship: {
    id: 'starship',
    name: 'Starship',
    icon: '🛸',
    category: 'starfleet',
    cost: { credits: 2500, minerals: 600 },
    power: -10,
    fleet: 1,
    creditBoost: 3,
    requiresTerraform: 45,
    requires: 'starfleet_yard',
    desc: 'Explorer-class vessel — needs Shipyard & 45%'
  },
  shield: {
    id: 'shield',
    name: 'Shield Generator',
    icon: '🛡️',
    category: 'starfleet',
    cost: { credits: 900, minerals: 200 },
    power: -16,
    stormShield: 0.55,
    requiresTerraform: 30,
    desc: 'Shields colony from dust storms — 30% terraform'
  }
};

export const BUILD_ORDER = [
  'habitat', 'solar', 'farm', 'mine', 'garage', 'depot',
  'terraform', 'hydroponics',
  'research', 'comms',
  'spaceport', 'starfleet_yard', 'starship', 'shield'
];

export const BUILD_CATEGORIES = {
  colony: 'Colony',
  terraform: 'Terraform',
  science: 'Science',
  starfleet: 'Starfleet'
};