import { prisma } from "../db";

/**
 * Which stops can actually be reached from a given origin: any stop that sits
 * later on a route the origin also appears on. Without this the search form
 * offers 650 stop pairs of which only ~99 are served, so most searches return
 * "nothing runs this journey" and the product looks broken.
 */
export async function reachableFrom(originStopId: string) {
  return prisma.stop.findMany({
    where: {
      routeStops: {
        some: {
          route: { routeStops: { some: { stopId: originStopId } } },
          position: {
            gt: (
              await prisma.routeStop.findFirst({
                where: { stopId: originStopId },
                select: { position: true },
              })
            )?.position ?? 0,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

/** Origin stops that lead somewhere, with how many onward stops each serves. */
export async function originStops() {
  const rows = await prisma.$queryRaw<{ id: string; name: string; onward: bigint }[]>`
    SELECT s.id, s.name, count(DISTINCT later.stop_id) AS onward
      FROM stops s
      JOIN route_stops rs    ON rs.stop_id = s.id
      JOIN route_stops later  ON later.route_id = rs.route_id AND later.position > rs.position
     GROUP BY s.id, s.name
     ORDER BY s.name
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, onward: Number(r.onward) }));
}

/** Destination stops reachable from one origin, as a plain list. */
export async function destinationStops(originStopId: string) {
  const rows = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT DISTINCT s.id, s.name
      FROM stops s
      JOIN route_stops later ON later.stop_id = s.id
      JOIN route_stops origin ON origin.route_id = later.route_id
                             AND origin.position < later.position
     WHERE origin.stop_id = ${originStopId}
     ORDER BY s.name
  `;
  return rows;
}
