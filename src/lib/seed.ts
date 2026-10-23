/**
 * Synthetic operation feed.
 *
 * This is the only module that would be thrown away against real systems. Everything
 * downstream consumes an `OperationSnapshot` and does not care where it came from.
 *
 * Three deliberate choices:
 *
 *  1. **Seeded, not random.** A fixed PRNG means the board is identical on every request
 *     and every machine, so a screenshot, a demo and a bug report describe the same thing.
 *  2. **Recipes, not noise.** Issues are written out as named situations taken from what
 *     the ops team says actually reaches them by hand. Sampling flags at random produces
 *     either a board of nothing or a board of everything.
 *  3. **The classifier does the classifying.** Inbound issues carry only a message body
 *     and a sender; their kind and their route and stop references come from running
 *     `classify.ts` over the text, exactly as they would in production. If a message is
 *     written that the rules cannot read, it shows up on the board as `unknown` — which is
 *     the honest outcome, and worth seeing.
 *
 * Times are generated relative to the request, so the board always reads as live.
 */

import { classifyMessage, type Sender } from "./classify";
import type {
  AddressHistory,
  ContactEvent,
  Delivery,
  Driver,
  Issue,
  IssueKind,
  IssueMessage,
  IssueSource,
  OperationSnapshot,
  Route,
  Shipper,
} from "./domain";
import { computeShiftStats } from "./stats";
import { triageBoard } from "./triage";

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

const PICKUPS = [
  "Hub Vallecas",
  "Hub Villaverde",
  "Almacén Legazpi",
  "Hub San Blas",
  "Almacén Méndez Álvaro",
  "Hub Carabanchel",
];

const CLEAN_HISTORY: AddressHistory = {
  priorFailedAttempts: 0,
  corrected: false,
  missingUnit: false,
  requiresAccessCode: false,
  accessNoteOnFile: false,
};

/* ─────────────────────────── Route recipes ─────────────────────────── */

interface RouteRecipe {
  code: string;
  driverIndex: number | null;
  shipper: number;
  /** Minutes from now to the pickup slot. Negative is in the past. */
  pickupAtMin: number;
  pickup: number;
  stopCount: number;
  stopsCompleted: number;
  status: Route["status"];
  payCents: number;
  payStatus: Route["payStatus"];
  /** Minutes the assigned driver has been stationary, when that matters. */
  driverStalledMin?: number;
}

const ROUTES: RouteRecipe[] = [
  {
    code: "R-412",
    driverIndex: 0,
    shipper: 1,
    pickupAtMin: -35,
    pickup: 0,
    stopCount: 14,
    stopsCompleted: 0,
    status: "at_pickup",
    payCents: 4200,
    payStatus: "scheduled",
  },
  {
    code: "R-408",
    driverIndex: 1,
    shipper: 3,
    pickupAtMin: -260,
    pickup: 1,
    stopCount: 11,
    stopsCompleted: 11,
    status: "completed",
    payCents: 3100,
    payStatus: "paid",
  },
  {
    code: "R-417",
    driverIndex: 2,
    shipper: 0,
    pickupAtMin: 95,
    pickup: 2,
    stopCount: 9,
    stopsCompleted: 0,
    status: "claimed",
    payCents: 3600,
    payStatus: "scheduled",
  },
  {
    code: "R-421",
    driverIndex: null,
    shipper: 2,
    pickupAtMin: 18,
    pickup: 3,
    stopCount: 12,
    stopsCompleted: 0,
    status: "unclaimed",
    payCents: 3900,
    payStatus: "scheduled",
  },
  {
    code: "R-405",
    driverIndex: 3,
    shipper: 0,
    pickupAtMin: -150,
    pickup: 4,
    stopCount: 13,
    stopsCompleted: 6,
    status: "in_progress",
    payCents: 4400,
    payStatus: "scheduled",
    driverStalledMin: 34,
  },
  {
    code: "R-430",
    driverIndex: 4,
    shipper: 4,
    pickupAtMin: -90,
    pickup: 5,
    stopCount: 10,
    stopsCompleted: 7,
    status: "in_progress",
    payCents: 3300,
    payStatus: "scheduled",
  },
  {
    code: "R-433",
    driverIndex: 5,
    shipper: 5,
    pickupAtMin: -40,
    pickup: 0,
    stopCount: 8,
    stopsCompleted: 2,
    status: "in_progress",
    payCents: 2900,
    payStatus: "scheduled",
  },
  {
    code: "R-398",
    driverIndex: 6,
    shipper: 2,
    pickupAtMin: -310,
    pickup: 1,
    stopCount: 9,
    stopsCompleted: 9,
    status: "completed",
    payCents: 3400,
    payStatus: "paid",
  },
];

/* ─────────────────────────── Issue recipes ─────────────────────────── */

interface IssueRecipe {
  source: IssueSource;
  /** Minutes ago the issue arrived. */
  openedMin: number;
  /** Set only for `source: "detected"` — their ops board labels its own flags. */
  detectedKind?: IssueKind;
  /** The inbound message, verbatim. Its kind and references come from the classifier. */
  body?: string;
  sender?: Sender;
  /** Who raised it: a driver index, or a name for a customer/business. */
  driverIndex?: number;
  raisedByName?: string;
  /** Explicit links, used only when the classifier finds no reference in the text. */
  routeCode?: string;
  consignmentIndex?: number;
  answeredMinAgo?: number;
  slack?: { channel: string; replies: number };
  /** Earlier turns of the same thread. */
  priorMessages?: { minutesAgo: number; from: IssueMessage["from"]; body: string }[];
}

const ISSUES: IssueRecipe[] = [
  {
    // Driver cannot start. Fourteen stops frozen behind one unanswered text.
    source: "driver_sms",
    openedMin: 23,
    sender: "driver",
    driverIndex: 0,
    body: "Buenas, no me aparece la ruta de hoy en la app. Llevo 20 min en el hub esperando. R-412",
  },
  {
    // Pay disputes are a supply problem wearing a support ticket's clothes.
    source: "driver_sms",
    openedMin: 71,
    sender: "driver",
    driverIndex: 1,
    body: "Oye la R-408 me pagaron 22€ y eran 31€. Me pagaron de menos otra vez, ¿me lo podéis mirar?",
    slack: { channel: "#ops-pagos", replies: 4 },
  },
  {
    source: "detected",
    openedMin: 12,
    detectedKind: "route_unclaimed",
    routeCode: "R-421",
    raisedByName: "Dispatch board",
  },
  {
    source: "driver_sms",
    openedMin: 16,
    sender: "driver",
    driverIndex: 5,
    body: "En el almacén me faltan 3 bolsas, me dieron solo 11 y la lista dice 14. ¿Qué hago?",
    priorMessages: [
      { minutesAgo: 18, from: "driver", body: "Ya estoy en la recogida" },
    ],
  },
  {
    source: "detected",
    openedMin: 34,
    detectedKind: "stalled_driver",
    routeCode: "R-405",
    raisedByName: "Dispatch board",
    slack: { channel: "#ops-madrid", replies: 2 },
  },
  {
    // The one that should take fifteen seconds and currently takes a lookup.
    source: "driver_sms",
    openedMin: 8,
    sender: "driver",
    driverIndex: 2,
    body: "¿Cuánto paga la R-417? Para saber si la cojo",
  },
  {
    source: "customer_sms",
    openedMin: 41,
    sender: "customer",
    raisedByName: "Marta Ibáñez",
    consignmentIndex: 0,
    body: "¿Dónde está mi pedido VM-480200? Sigue sin llegar y me tengo que ir a las 14:00",
    priorMessages: [
      { minutesAgo: 95, from: "customer", body: "Buenos días, ¿a qué hora llega el pedido?" },
      { minutesAgo: 90, from: "ops", body: "Entre las 12 y las 14, le avisamos" },
    ],
  },
  {
    source: "customer_call",
    openedMin: 19,
    sender: "customer",
    raisedByName: "Javier Soler",
    consignmentIndex: 1,
    body: "Llamada: dice que el repartidor no puede entrar, necesita el código del portal. VM-480201",
  },
  {
    source: "customer_sms",
    openedMin: 54,
    sender: "customer",
    raisedByName: "Carmen Rueda",
    consignmentIndex: 2,
    body: "La dirección está mal, es el 4º izquierda y no el 2º. ¿Lo podéis cambiar antes de que venga?",
  },
  {
    source: "business_email",
    openedMin: 63,
    sender: "business",
    raisedByName: "Nórdica Muebles",
    consignmentIndex: 3,
    body: "Necesitamos la prueba de entrega del VM-480203 para cerrar la incidencia con el cliente.",
  },
  {
    source: "business_email",
    openedMin: 128,
    sender: "business",
    raisedByName: "Kioma Electrónica",
    body: "Adjunto el listado de incidencias de ayer, son varios pedidos que no cuadran.",
    answeredMinAgo: 40,
    slack: { channel: "#cuentas", replies: 7 },
  },
  {
    source: "detected",
    openedMin: 27,
    detectedKind: "late_pickup",
    routeCode: "R-433",
    raisedByName: "Dispatch board",
  },
  {
    source: "detected",
    openedMin: 9,
    detectedKind: "delivered_far_from_address",
    routeCode: "R-430",
    consignmentIndex: 4,
    raisedByName: "Dispatch board",
  },
  {
    // Written so the rules cannot read it. The blank result is the point.
    source: "driver_sms",
    openedMin: 6,
    sender: "driver",
    driverIndex: 4,
    body: "Oye una cosa, lo de ayer al final cómo quedó? 🙂",
  },
  {
    source: "driver_call",
    openedMin: 86,
    sender: "driver",
    driverIndex: 3,
    body: "Llamada: pregunta por qué no le salen rutas desde el lunes, dice que no figura ninguna.",
    answeredMinAgo: 52,
  },
];

/** Deliveries that are not tied to an issue, so the routes have real weight behind them. */
const FILLER_COUNT = 34;

export function buildSnapshot(nowIso = new Date().toISOString()): OperationSnapshot {
  const random = prng(SEED);
  const now = Date.parse(nowIso);
  const iso = (minutesFromNow: number) =>
    new Date(now + minutesFromNow * 60_000).toISOString();
  const pick = <T,>(list: readonly T[], i: number) => list[i % list.length];

  /* Drivers */
  const drivers: Record<string, Driver> = {};
  const driverIds: string[] = [];
  DRIVER_NAMES.forEach((name, i) => {
    const id = `drv_${String(i + 1).padStart(2, "0")}`;
    driverIds.push(id);
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

  const shippers: Record<string, Shipper> = {};
  for (const shipper of SHIPPERS) shippers[shipper.id] = shipper;

  /* Routes */
  const routes: Record<string, Route> = {};
  const routeByCode: Record<string, Route> = {};
  ROUTES.forEach((recipe, i) => {
    const id = `rte_${String(i + 1).padStart(2, "0")}`;
    const driverId = recipe.driverIndex === null ? null : driverIds[recipe.driverIndex];

    if (driverId && recipe.driverStalledMin !== undefined) {
      const driver = drivers[driverId];
      driver.status = "stopped";
      driver.minutesSinceMovement = recipe.driverStalledMin;
      driver.lastPingAt = iso(-recipe.driverStalledMin);
      driver.atStopGeofence = false;
    }

    const route: Route = {
      id,
      code: recipe.code,
      driverId,
      shipperId: SHIPPERS[recipe.shipper].id,
      pickupAt: iso(recipe.pickupAtMin),
      pickupLocation: pick(PICKUPS, recipe.pickup),
      stopCount: recipe.stopCount,
      stopsCompleted: recipe.stopsCompleted,
      status: recipe.status,
      payCents: recipe.payCents,
      payStatus: recipe.payStatus,
    };
    routes[id] = route;
    routeByCode[recipe.code] = route;
  });

  const activeRoutes = Object.values(routes).filter(
    (route) => route.status !== "completed" && route.status !== "cancelled",
  );

  /* Deliveries */
  const deliveries: Delivery[] = [];
  let consignment = 480_200;
  let nameCursor = 0;
  let streetCursor = 0;

  const nextAddress = () => {
    const [line, district, postcode] = pick(STREETS, streetCursor++);
    return {
      line: `${line} ${2 + Math.floor(random() * 180)}`,
      district,
      postcode,
    };
  };

  /**
   * The first few deliveries are the ones issues point at, so their state matches the
   * story the message tells.
   */
  const FEATURED: {
    routeCode: string;
    status: Delivery["status"];
    windowEndMin: number;
    stopsAhead: number;
    contacts?: number[];
    history?: Partial<AddressHistory>;
    pod?: boolean;
  }[] = [
    { routeCode: "R-430", status: "en_route", windowEndMin: 12, stopsAhead: 2, contacts: [41, 95] },
    { routeCode: "R-430", status: "en_route", windowEndMin: 25, stopsAhead: 1, history: { requiresAccessCode: true } },
    { routeCode: "R-433", status: "assigned", windowEndMin: 140, stopsAhead: 5, history: { corrected: true } },
    { routeCode: "R-398", status: "delivered", windowEndMin: -180, stopsAhead: 0, pod: true },
    { routeCode: "R-430", status: "delivered", windowEndMin: -45, stopsAhead: 0, pod: true },
  ];

  FEATURED.forEach((spec, i) => {
    const route = routeByCode[spec.routeCode];
    const contacts: ContactEvent[] = (spec.contacts ?? []).map((minutesAgo, n) => ({
      at: iso(-minutesAgo),
      channel: n % 2 === 0 ? "whatsapp" : "call",
      from: "consignee",
      note: "Asked where the parcel is",
    }));

    deliveries.push({
      id: `dlv_${String(i + 1).padStart(3, "0")}`,
      consignmentNo: `VM-${consignment++}`,
      routeId: route.id,
      consignee: {
        name: pick(CONSIGNEE_NAMES, nameCursor++),
        phone: `+34 6${String(20 + i).padStart(2, "0")} ${String(300 + i * 11).slice(0, 3)} ${String(400 + i * 17).slice(0, 3)}`,
      },
      address: nextAddress(),
      shipperId: route.shipperId,
      driverId: route.driverId,
      status: spec.status,
      stopsAhead: spec.stopsAhead,
      windowStart: iso(spec.windowEndMin - 120),
      windowEnd: iso(spec.windowEndMin),
      attempts: 0,
      contacts,
      addressHistory: { ...CLEAN_HISTORY, ...spec.history },
      lastScanAt: iso(-20 - Math.floor(random() * 90)),
      podPhotoId: spec.pod ? `IMG-${7100 + i}` : null,
    });
  });

  for (let i = 0; i < FILLER_COUNT; i++) {
    const route = pick(activeRoutes, i);
    const delivered = i % 4 === 0;
    const windowEndMin = delivered ? -60 - i * 6 : 20 + i * 9;

    deliveries.push({
      id: `dlv_${String(FEATURED.length + i + 1).padStart(3, "0")}`,
      consignmentNo: `VM-${consignment++}`,
      routeId: route.id,
      consignee: {
        name: pick(CONSIGNEE_NAMES, nameCursor++),
        phone: `+34 6${String(40 + i).padStart(2, "0")} ${String(500 + i * 9).slice(0, 3)} ${String(600 + i * 19).slice(0, 3)}`,
      },
      address: nextAddress(),
      shipperId: route.shipperId,
      driverId: route.driverId,
      status: delivered ? "delivered" : i % 3 === 1 ? "assigned" : "en_route",
      stopsAhead: delivered ? 0 : 1 + (i % 7),
      windowStart: iso(windowEndMin - 120),
      windowEnd: iso(windowEndMin),
      attempts: 0,
      contacts: [],
      addressHistory: CLEAN_HISTORY,
      lastScanAt: iso(-10 - Math.floor(random() * 120)),
      podPhotoId: delivered ? `IMG-${7200 + i}` : null,
    });
  }

  /* Issues */
  const issues: Issue[] = ISSUES.map((recipe, i) => {
    const driver = recipe.driverIndex === undefined ? null : drivers[driverIds[recipe.driverIndex]];

    // Inbound issues are classified from their text, exactly as they would be live.
    const classified =
      recipe.body !== undefined && recipe.sender !== undefined && recipe.source !== "detected"
        ? classifyMessage(recipe.body, recipe.sender)
        : null;

    const kind: IssueKind = classified ? classified.kind : recipe.detectedKind ?? "unknown";

    // Prefer what the text actually referenced; fall back to what the system already knows
    // (an SMS maps to a driver by phone number, and a driver has an active route).
    const routeFromText = classified?.routeCode ? routeByCode[classified.routeCode] : undefined;
    const routeFromRecipe = recipe.routeCode ? routeByCode[recipe.routeCode] : undefined;
    const routeFromDriver = driver
      ? activeRoutes.find((route) => route.driverId === driver.id)
      : undefined;
    const route = routeFromText ?? routeFromRecipe ?? routeFromDriver ?? null;

    const deliveryFromText = classified?.consignmentNo
      ? deliveries.find((d) => d.consignmentNo === classified.consignmentNo)
      : undefined;
    const deliveryFromRecipe =
      recipe.consignmentIndex === undefined ? undefined : deliveries[recipe.consignmentIndex];
    const delivery = deliveryFromText ?? deliveryFromRecipe ?? null;

    const messages: IssueMessage[] = [];
    for (const prior of recipe.priorMessages ?? []) {
      messages.push({
        at: iso(-prior.minutesAgo),
        channel: recipe.source === "driver_call" || recipe.source === "customer_call" ? "call" : "sms",
        from: prior.from,
        body: prior.body,
      });
    }
    if (recipe.body !== undefined) {
      const channel: IssueMessage["channel"] =
        recipe.source === "business_email"
          ? "email"
          : recipe.source === "driver_call" || recipe.source === "customer_call"
            ? "call"
            : recipe.source === "slack"
              ? "slack"
              : "sms";
      messages.push({
        at: iso(-recipe.openedMin),
        channel,
        from: recipe.sender === "customer" ? "customer" : recipe.sender === "business" ? "business" : "driver",
        body: recipe.body,
      });
    }

    const raisedBy: Issue["raisedBy"] = driver
      ? { kind: "driver", id: driver.id, name: `${driver.code} · ${driver.name}` }
      : recipe.source === "detected"
        ? { kind: "system", id: "dispatch_board", name: recipe.raisedByName ?? "Dispatch board" }
        : recipe.source === "business_email"
          ? { kind: "business", id: "shipper", name: recipe.raisedByName ?? "A shipper" }
          : { kind: "customer", id: delivery?.id ?? "consignee", name: recipe.raisedByName ?? "A consignee" };

    return {
      id: `iss_${String(i + 1).padStart(3, "0")}`,
      ref: `ISS-${2040 + i}`,
      source: recipe.source,
      kind,
      openedAt: iso(-recipe.openedMin),
      raisedBy,
      routeId: route?.id ?? null,
      deliveryId: delivery?.id ?? null,
      messages,
      answeredAt: recipe.answeredMinAgo === undefined ? null : iso(-recipe.answeredMinAgo),
      slackThread: recipe.slack
        ? {
            channel: recipe.slack.channel,
            url: `https://slack.example/${recipe.slack.channel.replace("#", "")}`,
            replies: recipe.slack.replies,
          }
        : null,
    };
  });

  const base: OperationSnapshot = {
    now: nowIso,
    issues,
    routes,
    deliveries,
    drivers,
    shippers,
    shift: {
      // Shift history Radar does not model yet; see README.
      resolvedToday: 23,
      medianFirstReplyMin: 0,
      answeredFromOneScreen: 19,
      reopenedToday: 2,
    },
  };

  return { ...base, shift: computeShiftStats(triageBoard(base), base.shift) };
}
