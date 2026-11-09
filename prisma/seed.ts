import { PrismaClient } from "@prisma/client";
import { generateTrips } from "../src/lib/trips/generate";
import { newReference } from "../src/lib/bookings/reference";

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

/**
 * Demo boarding history. Without it the crowd forecast and the occupancy
 * monitor are empty on a fresh install and look broken. Every booking created
 * here is named "Demo passenger" and carries a `sim_seed` payment reference, so
 * seeded traffic is always distinguishable from real bookings.
 */
async function backfillHistory(days: number) {
  const schedules = await prisma.schedule.findMany({
    include: { route: { include: { routeStops: { orderBy: { position: "asc" } } } }, bus: true },
  });

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let trips = 0;
  let boardings = 0;

  for (let back = days; back >= 1; back--) {
    const day = new Date(todayUtc - back * 86400000);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;

    for (const sch of schedules) {
      if (!sch.weekdays.includes(day.getUTCDay())) continue;

      const trip = await prisma.trip.upsert({
        where: { scheduleId_departureDate: { scheduleId: sch.id, departureDate: day } },
        update: {},
        create: { scheduleId: sch.id, departureDate: day, departureTime: sch.departureTime },
      });
      trips++;

      const hour = Number(sch.departureTime.slice(0, 2));
      const peak = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
      let load = weekend ? 0.45 : peak ? 0.9 : 0.65;
      load = Math.min(0.99, Math.max(0.1, load + (Math.random() - 0.5) * 0.18));

      const capacity = sch.bus.rows * sch.bus.columns.length;
      const riders = Math.round(capacity * load);
      const stops = sch.route.routeStops;

      const bookings = [];
      const events = [];
      for (let i = 0; i < riders; i++) {
        const row = Math.floor(i / sch.bus.columns.length) + 1;
        const seatLabel = `${row}${sch.bus.columns[i % sch.bus.columns.length]}`;
        // Most ride the whole corridor; some ride a segment of it.
        const oIdx = Math.random() < 0.7 ? 0 : Math.floor(Math.random() * (stops.length - 1));
        const dIdx =
          Math.random() < 0.7
            ? stops.length - 1
            : oIdx + 1 + Math.floor(Math.random() * (stops.length - 1 - oIdx));

        const boardedAt = new Date(day);
        boardedAt.setUTCHours(hour, Number(sch.departureTime.slice(3, 5)) + Math.floor(Math.random() * 8));

        bookings.push({
          reference: newReference(),
          tripId: trip.id,
          seatLabel,
          passengerName: "Demo passenger",
          originStopId: stops[oIdx].stopId,
          destinationStopId: stops[dIdx].stopId,
          fareMinor: sch.route.fareMinor,
          paymentProviderRef: "sim_seed",
          boardedAt,
        });
      }

      for (const bk of bookings) {
        const { boardedAt, ...data } = bk;
        const booking = await prisma.booking.create({ data });
        const ticket = await prisma.ticket.create({
          data: { bookingId: booking.id, tripId: trip.id, status: "used", validatedAt: boardedAt },
        });
        events.push({
          ticketId: ticket.id,
          tripId: trip.id,
          seatLabel: bk.seatLabel,
          originStopId: bk.originStopId,
          destinationStopId: bk.destinationStopId,
          eventType: "validated" as const,
          occurredAt: boardedAt,
        });
        boardings++;
      }
      if (events.length) await prisma.ticketEvent.createMany({ data: events });
    }
  }
  return { trips, boardings };
}

/**
 * Partially fill upcoming trips, so a seat map matches the occupancy the crowd
 * forecast predicts. Without this a service shows "about 90% full" while every
 * seat on it is free, which reads as a bug.
 *
 * These are live bookings, not history: the ticket stays `issued` so the seat
 * is genuinely taken and a conductor could scan it.
 */
async function fillUpcomingTrips(days: number) {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
  const horizon = new Date(todayUtc.getTime() + days * 86400000);

  const trips = await prisma.trip.findMany({
    where: { departureDate: { gte: todayUtc, lte: horizon } },
    include: {
      schedule: { include: { route: { include: { routeStops: { orderBy: { position: "asc" } } } }, bus: true } },
      seats: { orderBy: { seatLabel: "asc" } },
    },
  });

  let filled = 0;
  for (const trip of trips) {
    const hour = Number(trip.departureTime.slice(0, 2));
    const weekend = trip.departureDate.getUTCDay() === 0 || trip.departureDate.getUTCDay() === 6;
    const peak = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);

    // Leave real headroom so a demo can always book a seat.
    let load = weekend ? 0.35 : peak ? 0.7 : 0.45;
    load = Math.min(0.8, Math.max(0.05, load + (Math.random() - 0.5) * 0.2));

    const stops = trip.schedule.route.routeStops;
    const take = Math.round(trip.seats.length * load);
    // Scatter the taken seats instead of filling front to back.
    const chosen = [...trip.seats].sort(() => Math.random() - 0.5).slice(0, take);

    for (const seat of chosen) {
      const oIdx = Math.random() < 0.7 ? 0 : Math.floor(Math.random() * (stops.length - 1));
      const dIdx =
        Math.random() < 0.7
          ? stops.length - 1
          : oIdx + 1 + Math.floor(Math.random() * (stops.length - 1 - oIdx));

      const booking = await prisma.booking.create({
        data: {
          reference: newReference(),
          tripId: trip.id,
          seatLabel: seat.seatLabel,
          passengerName: "Demo passenger",
          originStopId: stops[oIdx].stopId,
          destinationStopId: stops[dIdx].stopId,
          fareMinor: trip.schedule.route.fareMinor,
          paymentProviderRef: "sim_seed",
        },
      });
      const ticket = await prisma.ticket.create({
        data: { bookingId: booking.id, tripId: trip.id },
      });
      await prisma.seatInventory.update({
        where: { id: seat.id },
        data: { status: "booked", holdToken: null, holdExpiresAt: null },
      });
      await prisma.ticketEvent.createMany({
        data: (["paid", "issued"] as const).map((eventType) => ({
          ticketId: ticket.id,
          tripId: trip.id,
          seatLabel: seat.seatLabel,
          originStopId: stops[oIdx].stopId,
          destinationStopId: stops[dIdx].stopId,
          eventType,
        })),
      });
      filled++;
    }
  }
  return { trips: trips.length, seats: filled };
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

  // Demo history, unless explicitly skipped.
  if (process.env.SEED_HISTORY === "false") {
    console.log("Skipped boarding history (SEED_HISTORY=false).");
  } else if ((await prisma.ticketEvent.count()) > 0) {
    console.log("Boarding history already present; left untouched.");
  } else {
    const h = await backfillHistory(21);
    console.log(`Backfilled ${h.trips} past trips and ${h.boardings} demo boardings.`);
    const f = await fillUpcomingTrips(7);
    console.log(`Pre-booked ${f.seats} seats across ${f.trips} upcoming trips.`);
  }
}

main().finally(() => prisma.$disconnect());
