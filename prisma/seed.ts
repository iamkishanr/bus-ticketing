import { PrismaClient } from "@prisma/client";
import { generateTrips } from "../src/lib/trips/generate";

const prisma = new PrismaClient();

/**
 * Bus stops named after well-known Bangalore localities (the metro station
 * names are the familiar reference point for each area). These are bus
 * services along those corridors, not metro trains.
 */
const WHITEFIELD_CORRIDOR = [
  "Whitefield (Kadugodi Bus Depot)",
  "Krishnarajapura",
  "Byappanahalli",
  "Indiranagar",
  "Trinity",
  "Mahatma Gandhi Road",
  "Majestic Bus Station",
  "Vijayanagar",
  "Kengeri",
  "Challaghatta",
];

const TUMKUR_ROAD_CORRIDOR = [
  "Madavara",
  "Peenya",
  "Yeshwanthpur",
  "Malleshwaram (Sampige Road)",
  "Majestic Bus Station",
  "Chickpete",
  "Jayanagar",
  "Banashankari",
  "Silk Institute",
];

const AIRPORT_CORRIDOR = [
  "Majestic Bus Station",
  "Mekhri Circle",
  "Hebbal",
  "Yelahanka",
  "Devanahalli",
  "Kempegowda Airport",
];

const OUTER_RING_CORRIDOR = [
  "Silk Board",
  "BTM Layout",
  "Bellandur",
  "Marathahalli",
  "Krishnarajapura",
  "Hebbal",
];

const SOUTH_CORRIDOR = [
  "Banashankari",
  "Jayanagar",
  "Lalbagh",
  "Majestic Bus Station",
  "Malleshwaram (Sampige Road)",
  "Yeshwanthpur",
];

const HOSUR_ROAD_CORRIDOR = [
  "Ragigudda",
  "Jayadeva Hospital",
  "BTM Layout",
  "Silk Board",
  "Bommasandra",
  "Electronic City",
];

async function route(
  name: string,
  fareMinor: number,
  stopNames: string[],
  stopIds: Record<string, string>,
) {
  return prisma.route.create({
    data: {
      name,
      fareMinor,
      routeStops: {
        create: stopNames.map((n, i) => ({ stopId: stopIds[n], position: i + 1 })),
      },
    },
  });
}

async function main() {
  const allNames = Array.from(new Set([
    ...WHITEFIELD_CORRIDOR, ...TUMKUR_ROAD_CORRIDOR, ...HOSUR_ROAD_CORRIDOR,
    ...AIRPORT_CORRIDOR, ...OUTER_RING_CORRIDOR, ...SOUTH_CORRIDOR,
  ]));
  const stopIds: Record<string, string> = {};
  for (const name of allNames) {
    const stop = await prisma.stop.upsert({ where: { name }, update: {}, create: { name } });
    stopIds[name] = stop.id;
  }

  if (await prisma.route.findFirst()) {
    console.log("Routes already seeded; generating trips only.");
  } else {
    const bus36 = await prisma.bus.create({
      data: { label: "KA-01-F-7781 (36 seat)", rows: 9, columns: ["A", "B", "C", "D"] },
    });
    const bus20 = await prisma.bus.create({
      data: { label: "KA-05-H-2290 (20 seat)", rows: 5, columns: ["A", "B", "C", "D"] },
    });
    const bus40 = await prisma.bus.create({
      data: { label: "KA-02-K-6614 (40 seat)", rows: 10, columns: ["A", "B", "C", "D"] },
    });
    const bus28 = await prisma.bus.create({
      data: { label: "KA-04-M-3307 (28 seat)", rows: 7, columns: ["A", "B", "C", "D"] },
    });
    const bus24 = await prisma.bus.create({
      data: { label: "KA-09-P-1122 (24 seat)", rows: 6, columns: ["A", "B", "C", "D"] },
    });

    const whitefield = await route("Route 500D — Whitefield to Challaghatta", 7500, WHITEFIELD_CORRIDOR, stopIds);
    const tumkurRoad = await route("Route 401K — Madavara to Silk Institute", 6000, TUMKUR_ROAD_CORRIDOR, stopIds);
    const hosurRoad = await route("Route 356E — Ragigudda to Electronic City", 5500, HOSUR_ROAD_CORRIDOR, stopIds);
    const airport = await route("Route KIA-9 — Majestic to Airport", 29000, AIRPORT_CORRIDOR, stopIds);
    const outerRing = await route("Route 500K — Silk Board to Hebbal", 8000, OUTER_RING_CORRIDOR, stopIds);
    const south = await route("Route 210G — Banashankari to Yeshwanthpur", 5000, SOUTH_CORRIDOR, stopIds);

    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    const weekdays = [1, 2, 3, 4, 5];

    const services: { routeId: string; busId: string; departureTime: string; weekdays: number[] }[] = [
      // Whitefield corridor — commuter peaks
      { routeId: whitefield.id, busId: bus36.id, departureTime: "07:30", weekdays: everyDay },
      { routeId: whitefield.id, busId: bus36.id, departureTime: "18:15", weekdays },
      // Tumkur Road
      { routeId: tumkurRoad.id, busId: bus40.id, departureTime: "08:00", weekdays: everyDay },
      { routeId: tumkurRoad.id, busId: bus40.id, departureTime: "17:45", weekdays },
      // Hosur Road / Electronic City
      { routeId: hosurRoad.id, busId: bus20.id, departureTime: "09:00", weekdays },
      { routeId: hosurRoad.id, busId: bus20.id, departureTime: "19:00", weekdays },
      // Airport, runs all day every day
      { routeId: airport.id, busId: bus28.id, departureTime: "05:30", weekdays: everyDay },
      { routeId: airport.id, busId: bus28.id, departureTime: "13:00", weekdays: everyDay },
      { routeId: airport.id, busId: bus28.id, departureTime: "21:30", weekdays: everyDay },
      // Outer ring
      { routeId: outerRing.id, busId: bus24.id, departureTime: "08:30", weekdays: everyDay },
      { routeId: outerRing.id, busId: bus24.id, departureTime: "18:45", weekdays },
      // South corridor
      { routeId: south.id, busId: bus24.id, departureTime: "10:15", weekdays: everyDay },
    ];

    for (const svc of services) await prisma.schedule.create({ data: svc });
  }

  const schedules = await prisma.schedule.findMany();
  let total = 0;
  for (const s of schedules) total += await generateTrips(s.id, 14);
  const routeCount = await prisma.route.count();
  console.log(`Seeded ${allNames.length} stops, ${routeCount} routes, ${schedules.length} services. Generated ${total} trips.`);
}

main().finally(() => prisma.$disconnect());
