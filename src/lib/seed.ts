/**
 * Synthetic operation feed.
 *
 * This is the only module that would be thrown away against a real dispatch system.
 * Everything downstream — the engine, the plays, the UI — consumes `OperationSnapshot`
 * and does not care where it came from.
 *
 * Two deliberate choices:
 *
 *  1. **Seeded, not random.** A fixed PRNG means the board is identical on every
 *     request and every machine, so a screenshot, a demo and a bug report all describe
 *     the same thing.
 *  2. **Recipes, not noise.** Incidents are written out as named scenarios rather than
 *     sampled, because a demo board has to contain a legible spread of real situations.
 *     Random flags produce either a board of nothing or a board of everything.
 *
 * Times are generated relative to the request, so the manifest always reads as live.
 */

import type {
  AddressHistory,
  ContactEvent,
  Delivery,
  Driver,
  OperationSnapshot,
  Shipper,
} from "./domain";
import { computeShiftStats } from "./stats";
import { scoreBoard } from "./risk";

const SEED = 0x5a17b0;

/** mulberry32 — small, fast, good enough for fixtures. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHIPPERS: Shipper[] = [
  { id: "shp_nordica", name: "Nórdica Muebles", slaTier: "contract", podRequired: true },
  { id: "shp_farmacia", name: "Farmacia Central", slaTier: "contract", podRequired: true },
  { id: "shp_kioma", name: "Kioma Electrónica", slaTier: "contract", podRequired: false },
  { id: "shp_bazar", name: "Bazar Sol", slaTier: "standard", podRequired: false },
  { id: "shp_norte", name: "Tienda Norte", slaTier: "standard", podRequired: false },
  { id: "shp_arce", name: "Panadería Arce", slaTier: "standard", podRequired: false },
];

const DRIVER_NAMES = [
  "Lucía Ferrer",
  "Andrés Pardo",
  "Nuria Bosch",
  "Iván Peña",
  "Tomás Gil",
  "Rocío Mesa",
  "Óscar Rivas",
  "Celia Robles",
  "Marcos Aguilar",
  "Alba Sierra",
  "Rubén Calvo",
  "Noelia Ruano",
  "Gonzalo Vega",
  "Teresa Marín",
];

const CONSIGNEE_NAMES = [
  "Marta Ibáñez",
  "Javier Soler",
  "Carmen Rueda",
  "Pablo Nieto",
  "Elena Vidal",
  "Sergio Lara",
  "Beatriz Alonso",
  "Paula Carmona",
  "Diego Herrera",
  "Silvia Cano",
  "Raúl Montes",
  "Hugo Delgado",
  "Irene Prados",
  "Víctor Narváez",
  "Lorena Fuentes",
  "Adrián Castaño",
  "Sara Benítez",
  "Álvaro Cifuentes",
  "Patricia Olmo",
  "Nicolás Bravo",
  "Daniela Puente",
  "Emilio Sanz",
  "Clara Montero",
  "Ismael Duarte",
  "Rosa Bermejo",
  "Félix Carrasco",
  "Lydia Serrano",
  "Mateo Quintana",
  "Ángela Pombo",
  "Bruno Lillo",
  "Nerea Cuesta",
  "Samuel Arroyo",
  "Vera Lozano",
  "Joaquín Ribas",
  "Miriam Esteve",
  "Darío Gallego",
  "Olalla Vicente",
  "César Maestre",
  "Amaia Loren",
  "Guillermo Pujol",
  "Lola Herranz",
  "Aitor Belmonte",
  "Sonia Araújo",
  "Martín Escudero",
  "Eva Camacho",
  "Rodrigo Nuño",
];

const STREETS = [
  ["Calle de Alcalá", "Salamanca", "28009"],
  ["Gran Vía", "Centro", "28013"],
  ["Paseo de la Castellana", "Chamartín", "28046"],
  ["Calle de Fuencarral", "Centro", "28004"],
  ["Calle de Serrano", "Salamanca", "28006"],
  ["Calle de Atocha", "Centro", "28012"],
  ["Calle de Bravo Murillo", "Tetuán", "28020"],
  ["Calle de Goya", "Salamanca", "28001"],
  ["Paseo del Prado", "Retiro", "28014"],
  ["Calle de Toledo", "Centro", "28005"],
  ["Calle de Embajadores", "Arganzuela", "28012"],
  ["Calle de Hortaleza", "Centro", "28004"],
  ["Avenida de América", "Ciudad Lineal", "28002"],
  ["Calle del Doctor Esquerdo", "Retiro", "28007"],
  ["Calle de Ibiza", "Retiro", "28009"],
  ["Calle de Velázquez", "Salamanca", "28001"],
  ["Calle de Arturo Soria", "Hortaleza", "28033"],
  ["Calle de Narváez", "Retiro", "28009"],
  ["Calle de Santa Engracia", "Chamberí", "28010"],
  ["Calle de Ríos Rosas", "Chamberí", "28003"],
] as const;

const CHASE_NOTES = [
  "Asked where the parcel is, said she has to leave at 13:00",
  "Second call today, wants a firm time",
  "Says the driver never rang the buzzer",
  "Working from home until 14:00 only",
  "Asked to leave it with the portero",
  "Wants to know if it still arrives today",
];

const CLEAN_HISTORY: AddressHistory = {
  priorFailedAttempts: 0,
  corrected: false,
  missingUnit: false,
  requiresAccessCode: false,
  accessNoteOnFile: false,
};

/**
 * A named situation on the board. `stopsAhead` and `windowEndMin` are what actually
 * drive the ETA projection, so each recipe reads as the operational story it is.
 */
interface Recipe {
  note: string;
  status: Delivery["status"];
  /** Minutes from now until the promised window closes. Negative means already past. */
  windowEndMin: number;
  stopsAhead?: number;
  driverStalledMin?: number;
  /** Minutes ago for each consignee chase. */
  chases?: number[];
  attempts?: number;
  history?: Partial<AddressHistory>;
  /** Index into SHIPPERS; contract accounts are the first three. */
  shipper?: number;
  unassigned?: boolean;
}

const RECIPES: Recipe[] = [
  {
    note: "Van stopped on the M-30 for 26 minutes with a contract account on board",
    status: "en_route",
    windowEndMin: 18,
    stopsAhead: 5,
    driverStalledMin: 26,
    shipper: 0,
  },
  {
    note: "Failed attempt this morning, address has failed twice before, consignee now chasing",
    status: "attempted",
    windowEndMin: -35,
    stopsAhead: 2,
    attempts: 1,
    chases: [12, 48],
    history: { priorFailedAttempts: 2, corrected: true },
    shipper: 1,
  },
  {
    note: "Badly behind on the route and the consignee has called three times",
    status: "en_route",
    windowEndMin: -10,
    stopsAhead: 7,
    chases: [6, 25, 70],
    shipper: 3,
  },
  {
    note: "Pharmacy delivery, failed attempt, no entry code on file, window shutting",
    status: "attempted",
    windowEndMin: 22,
    stopsAhead: 3,
    attempts: 1,
    history: { requiresAccessCode: true },
    shipper: 1,
  },
  {
    note: "Route is running long, furniture delivery on a penalty window",
    status: "en_route",
    windowEndMin: 5,
    stopsAhead: 6,
    shipper: 0,
  },
  {
    note: "Still sitting in the depot with twelve minutes of window left",
    status: "pending",
    windowEndMin: 12,
    unassigned: true,
    shipper: 2,
  },
  {
    note: "Gated building, no entry code on file, driver two stops away",
    status: "en_route",
    windowEndMin: 14,
    stopsAhead: 2,
    history: { requiresAccessCode: true, missingUnit: true },
    shipper: 2,
  },
  {
    note: "Assigned but never dispatched, window closed forty minutes ago",
    status: "assigned",
    windowEndMin: -40,
    unassigned: true,
    shipper: 4,
  },
  {
    note: "Driver parked off-route for fifteen minutes, probably lunch",
    status: "en_route",
    windowEndMin: 40,
    stopsAhead: 4,
    driverStalledMin: 15,
    shipper: 5,
  },
  {
    note: "Consignee has chased twice, delivery is actually on time",
    status: "en_route",
    windowEndMin: 70,
    stopsAhead: 2,
    chases: [15, 55],
    shipper: 4,
  },
  {
    note: "Electronics on a contract account, one previous failure at this address",
    status: "en_route",
    windowEndMin: 95,
    stopsAhead: 3,
    history: { priorFailedAttempts: 1 },
    shipper: 2,
  },
  {
    note: "Entry code missing but there is plenty of window left",
    status: "en_route",
    windowEndMin: 150,
    stopsAhead: 4,
    history: { requiresAccessCode: true },
    shipper: 3,
  },
  {
    note: "No unit number on a twelve-floor block",
    status: "assigned",
    windowEndMin: 180,
    stopsAhead: 8,
    history: { missingUnit: true },
    shipper: 5,
  },
  {
    note: "Routine contract delivery, nothing wrong yet",
    status: "en_route",
    windowEndMin: 210,
    stopsAhead: 5,
    shipper: 1,
  },
];

/** How many comfortable deliveries pad the board out. */
const FILLER_COUNT = 32;

export function buildSnapshot(nowIso = new Date().toISOString()): OperationSnapshot {
  const random = prng(SEED);
  const now = Date.parse(nowIso);
  const iso = (minutesFromNow: number) =>
    new Date(now + minutesFromNow * 60_000).toISOString();
  const pick = <T,>(list: readonly T[], i: number) => list[i % list.length];

  const drivers: Record<string, Driver> = {};
  DRIVER_NAMES.forEach((name, i) => {
    const id = `drv_${String(i + 1).padStart(2, "0")}`;
    drivers[id] = {
      id,
      code: `V-${String(7 + i * 3).padStart(2, "0")}`,
      name,
      phone: `+34 6${String(10 + i).padStart(2, "0")} ${String(100 + i * 7).slice(0, 3)} ${String(200 + i * 13).slice(0, 3)}`,
      status: "driving",
      lastPingAt: iso(-1 - Math.floor(random() * 3)),
      minutesSinceMovement: 1 + Math.floor(random() * 3),
      atStopGeofence: false,
    };
  });
  const driverIds = Object.keys(drivers);

  const shippers: Record<string, Shipper> = {};
  for (const shipper of SHIPPERS) shippers[shipper.id] = shipper;

  const deliveries: Delivery[] = [];
  let consignment = 480_200;
  let nameCursor = 0;
  let streetCursor = 0;

  const nextAddress = () => {
    const [line, district, postcode] = pick(STREETS, streetCursor++);
    const number = 2 + Math.floor(random() * 180);
    return { line: `${line} ${number}`, district, postcode };
  };

  const makeContacts = (chases: number[] | undefined): ContactEvent[] =>
    (chases ?? []).map((minutesAgo, i) => ({
      at: iso(-minutesAgo),
      channel: i % 2 === 0 ? "whatsapp" : "call",
      from: "consignee",
      note: pick(CHASE_NOTES, i + streetCursor),
    }));

  // The incidents, written out as scenarios.
  RECIPES.forEach((recipe, i) => {
    const driverId = recipe.unassigned ? null : pick(driverIds, i);
    if (driverId) {
      const driver = drivers[driverId];
      if (recipe.driverStalledMin !== undefined) {
        driver.status = "stopped";
        driver.minutesSinceMovement = recipe.driverStalledMin;
        driver.lastPingAt = iso(-recipe.driverStalledMin);
        driver.atStopGeofence = false;
      }
    }

    deliveries.push({
      id: `dlv_${String(i + 1).padStart(3, "0")}`,
      consignmentNo: `VM-${consignment++}`,
      consignee: {
        name: pick(CONSIGNEE_NAMES, nameCursor++),
        phone: `+34 6${String(20 + i).padStart(2, "0")} ${String(300 + i * 11).slice(0, 3)} ${String(400 + i * 17).slice(0, 3)}`,
      },
      address: nextAddress(),
      shipperId: SHIPPERS[recipe.shipper ?? i % SHIPPERS.length].id,
      driverId,
      status: recipe.status,
      stopsAhead: recipe.stopsAhead ?? 1,
      windowStart: iso(recipe.windowEndMin - 120),
      windowEnd: iso(recipe.windowEndMin),
      attempts: recipe.attempts ?? 0,
      contacts: makeContacts(recipe.chases),
      addressHistory: { ...CLEAN_HISTORY, ...recipe.history },
      lastScanAt: iso(-20 - Math.floor(random() * 90)),
    });
  });

  // The rest of the day: deliveries that are fine, which is what most of them are.
  for (let i = 0; i < FILLER_COUNT; i++) {
    const delivered = i % 3 === 0;
    const driverId = pick(driverIds, i + 5);
    const windowEndMin = delivered ? -60 - i * 7 : 120 + i * 11;

    deliveries.push({
      id: `dlv_${String(RECIPES.length + i + 1).padStart(3, "0")}`,
      consignmentNo: `VM-${consignment++}`,
      consignee: {
        name: pick(CONSIGNEE_NAMES, nameCursor++),
        phone: `+34 6${String(40 + i).padStart(2, "0")} ${String(500 + i * 9).slice(0, 3)} ${String(600 + i * 19).slice(0, 3)}`,
      },
      address: nextAddress(),
      shipperId: SHIPPERS[(i + 2) % SHIPPERS.length].id,
      driverId,
      status: delivered ? "delivered" : i % 4 === 1 ? "assigned" : "en_route",
      stopsAhead: delivered ? 0 : 2 + (i % 8),
      windowStart: iso(windowEndMin - 120),
      windowEnd: iso(windowEndMin),
      attempts: 0,
      contacts: [],
      addressHistory: CLEAN_HISTORY,
      lastScanAt: iso(-10 - Math.floor(random() * 120)),
    });
  }

  const base: OperationSnapshot = {
    now: nowIso,
    deliveries,
    drivers,
    shippers,
    shift: {
      detectedProactively: 0,
      incidentsToday: 0,
      medianLeadTimeMin: 0,
      // Shift history Radar does not model yet; see README.
      resolvedToday: 11,
      falsePositivesToday: 2,
    },
  };

  return { ...base, shift: computeShiftStats(scoreBoard(base), base.shift) };
}
