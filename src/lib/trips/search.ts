import { prisma } from "../db";
import { calendarDay } from "./date";

/** R4: search by origin, destination, date. Availability counts expired holds as free (KTD6). */
export async function searchTrips(originStopId: string, destinationStopId: string, date: Date) {
  const day = calendarDay(date);

  const trips = await prisma.trip.findMany({
    where: {
      departureDate: day,
      schedule: {
        route: {
          routeStops: { some: { stopId: originStopId } },
        },
      },
    },
    include: {
      schedule: { include: { route: { include: { routeStops: { include: { stop: true } } } }, bus: true } },
      seats: true,
    },
    orderBy: { departureTime: "asc" },
  });

  const now = new Date();
  return trips
    .filter((trip) => {
      const stops = trip.schedule.route.routeStops;
      const o = stops.find((s) => s.stopId === originStopId);
      const d = stops.find((s) => s.stopId === destinationStopId);
      return o && d && o.position < d.position; // ascending stop order only
    })
    .map((trip) => ({
      id: trip.id,
      scheduleId: trip.scheduleId,
      departureDate: trip.departureDate,
      routeName: trip.schedule.route.name,
      departureTime: trip.departureTime,
      fareMinor: trip.schedule.route.fareMinor,
      seatsAvailable: trip.seats.filter(
        (s) => s.status === "available" || (s.status === "held" && s.holdExpiresAt !== null && s.holdExpiresAt < now),
      ).length,
      seatsTotal: trip.seats.length,
    }));
}

export async function getTripWithSeats(tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      schedule: { include: { route: { include: { routeStops: { include: { stop: true }, orderBy: { position: "asc" } } } }, bus: true } },
      seats: { orderBy: { seatLabel: "asc" } },
    },
  });
}

/**
 * Services departing today, for the landing page. A passenger who has not
 * searched yet sees real, bookable departures rather than an empty form.
 */
export async function todaysServices(limit = 10) {
  const day = calendarDay(new Date());
  const trips = await prisma.trip.findMany({
    where: { departureDate: day },
    include: {
      schedule: {
        include: {
          route: { include: { routeStops: { include: { stop: true }, orderBy: { position: "asc" } } } },
          bus: true,
        },
      },
      seats: true,
    },
    orderBy: { departureTime: "asc" },
    take: limit,
  });

  const now = new Date();
  return trips.map((trip) => {
    const stops = trip.schedule.route.routeStops;
    return {
      id: trip.id,
      scheduleId: trip.scheduleId,
      departureDate: trip.departureDate,
      routeName: trip.schedule.route.name,
      departureTime: trip.departureTime,
      fareMinor: trip.schedule.route.fareMinor,
      originStopId: stops[0]?.stopId ?? "",
      destinationStopId: stops[stops.length - 1]?.stopId ?? "",
      originName: stops[0]?.stop.name ?? "",
      destinationName: stops[stops.length - 1]?.stop.name ?? "",
      stopCount: stops.length,
      seatsAvailable: trip.seats.filter(
        (s) => s.status === "available" || (s.status === "held" && s.holdExpiresAt !== null && s.holdExpiresAt < now),
      ).length,
      seatsTotal: trip.seats.length,
    };
  });
}
