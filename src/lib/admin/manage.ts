import { prisma } from "../db";

/* ---------------- Create ---------------- */

export async function createStop(name: string) {
  const clean = name.trim();
  if (!clean) return { ok: false as const, error: "Stop name is required." };
  const existing = await prisma.stop.findUnique({ where: { name: clean } });
  if (existing) return { ok: false as const, error: `"${clean}" already exists.` };
  await prisma.stop.create({ data: { name: clean } });
  return { ok: true as const };
}

export async function createBus(label: string, rows: number, columns: string[]) {
  if (!label.trim()) return { ok: false as const, error: "Bus label is required." };
  if (!Number.isInteger(rows) || rows < 1 || rows > 30)
    return { ok: false as const, error: "Rows must be between 1 and 30." };
  if (columns.length < 2 || columns.length > 6)
    return { ok: false as const, error: "A bus needs between 2 and 6 seats per row." };
  await prisma.bus.create({ data: { label: label.trim(), rows, columns } });
  return { ok: true as const };
}

export async function createRoute(name: string, fareRupees: number, stopIds: string[]) {
  if (!name.trim()) return { ok: false as const, error: "Route name is required." };
  if (!(fareRupees > 0)) return { ok: false as const, error: "Fare must be more than zero." };

  const ordered = stopIds.filter(Boolean);
  if (ordered.length < 2)
    return { ok: false as const, error: "A route needs at least two stops." };
  if (new Set(ordered).size !== ordered.length)
    return { ok: false as const, error: "A route cannot visit the same stop twice." };

  await prisma.route.create({
    data: {
      name: name.trim(),
      fareMinor: Math.round(fareRupees * 100),
      routeStops: { create: ordered.map((stopId, i) => ({ stopId, position: i + 1 })) },
    },
  });
  return { ok: true as const };
}

export async function createSchedule(
  routeId: string, busId: string, departureTime: string, weekdays: number[],
) {
  if (!routeId || !busId) return { ok: false as const, error: "Pick a route and a bus." };
  if (!/^\d{2}:\d{2}$/.test(departureTime))
    return { ok: false as const, error: "Departure time must look like 08:30." };
  if (weekdays.length === 0)
    return { ok: false as const, error: "Pick at least one day of the week." };

  const clash = await prisma.schedule.findFirst({ where: { busId, departureTime } });
  if (clash)
    return { ok: false as const, error: "That bus already has a service at this time." };

  await prisma.schedule.create({ data: { routeId, busId, departureTime, weekdays } });
  return { ok: true as const };
}

/* ---------------- Impact and removal ---------------- */

export type Impact = {
  schedules: number;
  trips: number;
  futureTripsWithBookings: number;
  soldTickets: number;
  boardedTickets: number;
  events: number;
};

/**
 * What deleting this route would destroy. Every FK is ON DELETE CASCADE, so a
 * delete also removes bookings, tickets, and the append-only event log — which
 * the immutability trigger cannot prevent. Nothing is removed without this
 * count being shown first.
 */
export async function routeImpact(routeId: string): Promise<Impact | null> {
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    include: { schedules: { include: { trips: { select: { id: true } } } } },
  });
  if (!route) return null;

  const tripIds = route.schedules.flatMap((s) => s.trips.map((t) => t.id));
  if (tripIds.length === 0) {
    return { schedules: route.schedules.length, trips: 0, futureTripsWithBookings: 0,
             soldTickets: 0, boardedTickets: 0, events: 0 };
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [soldTickets, boardedTickets, events, futureWithBookings] = await Promise.all([
    prisma.ticket.count({ where: { tripId: { in: tripIds }, status: { not: "cancelled" } } }),
    prisma.ticket.count({ where: { tripId: { in: tripIds }, status: "used" } }),
    prisma.ticketEvent.count({ where: { tripId: { in: tripIds } } }),
    prisma.trip.count({
      where: { id: { in: tripIds }, departureDate: { gte: today }, bookings: { some: {} } },
    }),
  ]);

  return {
    schedules: route.schedules.length,
    trips: tripIds.length,
    futureTripsWithBookings: futureWithBookings,
    soldTickets, boardedTickets, events,
  };
}

/**
 * Retire a route: stop it being bookable without destroying history.
 * Removes future trips carrying neither bookings nor events, then drops the
 * schedules if nothing is left, or clears their running days if history remains.
 * Past trips, bookings, tickets and events are always left intact.
 */
export async function retireRoute(routeId: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const schedules = await prisma.schedule.findMany({
    where: { routeId }, select: { id: true },
  });
  const scheduleIds = schedules.map((s) => s.id);
  if (scheduleIds.length === 0) return { ok: true as const, removedTrips: 0, keptTrips: 0 };

  const removable = await prisma.trip.findMany({
    where: {
      scheduleId: { in: scheduleIds },
      departureDate: { gte: today },
      bookings: { none: {} },
      events: { none: {} },
    },
    select: { id: true },
  });

  await prisma.trip.deleteMany({ where: { id: { in: removable.map((t) => t.id) } } });

  // Only drop a schedule once none of its trips carry history; otherwise the
  // cascade would hit the append-only event log.
  const keptTrips = await prisma.trip.count({ where: { scheduleId: { in: scheduleIds } } });
  if (keptTrips === 0) {
    await prisma.schedule.deleteMany({ where: { id: { in: scheduleIds } } });
  } else {
    await prisma.schedule.updateMany({ where: { id: { in: scheduleIds } }, data: { weekdays: [] } });
  }
  return { ok: true as const, removedTrips: removable.length, keptTrips };
}

/** Permanent delete. Only allowed when the route carries no ticket history. */
export async function deleteRoute(routeId: string) {
  const impact = await routeImpact(routeId);
  if (!impact) return { ok: false as const, error: "Route not found." };
  if (impact.soldTickets > 0 || impact.events > 0) {
    return {
      ok: false as const,
      error: `This route has ${impact.soldTickets} ticket(s) and ${impact.events} boarding event(s). Retire it instead — deleting would destroy that history.`,
    };
  }
  await prisma.route.delete({ where: { id: routeId } });
  return { ok: true as const };
}

/** Remove one schedule, keeping any trip that already has a booking. */
export async function removeSchedule(scheduleId: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const booked = await prisma.trip.count({ where: { scheduleId, bookings: { some: {} } } });

  if (booked > 0) {
    const removable = await prisma.trip.findMany({
      where: { scheduleId, departureDate: { gte: today }, bookings: { none: {} }, events: { none: {} } },
      select: { id: true },
    });
    await prisma.trip.deleteMany({ where: { id: { in: removable.map((t) => t.id) } } });
    await prisma.schedule.update({ where: { id: scheduleId }, data: { weekdays: [] } });
    return {
      ok: true as const,
      retired: true,
      detail: `Removed ${removable.length} unbooked future trip(s) and stopped this service running. ${booked} trip(s) with bookings were kept for their history.`,
    };
  }

  const withEvents = await prisma.trip.count({ where: { scheduleId, events: { some: {} } } });
  if (withEvents > 0) {
    await prisma.trip.deleteMany({ where: { scheduleId, events: { none: {} } } });
    await prisma.schedule.update({ where: { id: scheduleId }, data: { weekdays: [] } });
    return { ok: true as const, retired: true,
             detail: `Stopped this service running. ${withEvents} trip(s) with boarding history were kept.` };
  }
  await prisma.$transaction(async (tx) => {
    await tx.trip.deleteMany({ where: { scheduleId } });
    await tx.schedule.delete({ where: { id: scheduleId } });
  });
  return { ok: true as const, retired: false, detail: "Service removed." };
}
