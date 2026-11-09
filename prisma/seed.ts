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
  const allNames = Array.from(new Set([...WHITEFIELD_CORRIDOR, ...TUMKUR_ROAD_CORRIDOR, ...HOSUR_ROAD_CORRIDOR]));
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

    const whitefield = await route("Route 500D — Whitefield to Challaghatta", 7500, WHITEFIELD_CORRIDOR, stopIds);
    const tumkurRoad = await route("Route 401K — Madavara to Silk Institute", 6000, TUMKUR_ROAD_CORRIDOR, stopIds);
    const hosurRoad = await route("Route 356E — Ragigudda to Electronic City", 5500, HOSUR_ROAD_CORRIDOR, stopIds);

    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    await prisma.schedule.create({
      data: { routeId: whitefield.id, busId: bus36.id, departureTime: "07:30", weekdays: everyDay },
    });
    await prisma.schedule.create({
      data: { routeId: whitefield.id, busId: bus36.id, departureTime: "18:15", weekdays: [1, 2, 3, 4, 5] },
    });
    await prisma.schedule.create({
      data: { routeId: tumkurRoad.id, busId: bus36.id, departureTime: "08:00", weekdays: everyDay },
    });
    await prisma.schedule.create({
      data: { routeId: hosurRoad.id, busId: bus20.id, departureTime: "09:00", weekdays: [1, 2, 3, 4, 5] },
    });
  }

  const schedules = await prisma.schedule.findMany();
  let total = 0;
  for (const s of schedules) total += await generateTrips(s.id, 14);
  console.log(`Seeded ${allNames.length} stations. Generated ${total} trips.`);
}

main().finally(() => prisma.$disconnect());
