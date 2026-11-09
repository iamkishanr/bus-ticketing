import { prisma } from "../db";
import { crowdLevel, type CrowdLevel } from "./estimate";

export type ServiceRow = {
  scheduleId: string;
  routeName: string;
  departureTime: string;
  busLabel: string;
  capacity: number;
  tripsRun: number;
  avgBoarded: number;
  avgPct: number;
  peakPct: number;
  level: CrowdLevel;
  byWeekday: { weekday: number; pct: number | null }[];
};

export type Totals = {
  boardings: number;
  tripsRun: number;
  avgPct: number;
  servicesTracked: number;
  busiestService: string | null;
  quietestService: string | null;
};

/** Per-service occupancy across all history, from validated boardings alone. */
export async function serviceOverview(): Promise<ServiceRow[]> {
  const rows = await prisma.$queryRaw<
    {
      schedule_id: string; route_name: string; departure_time: string; bus_label: string;
      capacity: number; trips_run: bigint; avg_boarded: number; peak_boarded: number;
    }[]
  >`
    WITH per_trip AS (
      SELECT t.id, t.schedule_id,
             count(e.id) AS boarded,
             (b.rows * array_length(b.columns, 1)) AS capacity
        FROM trips t
        JOIN schedules s ON s.id = t.schedule_id
        JOIN buses b     ON b.id = s.bus_id
        LEFT JOIN ticket_events e ON e.trip_id = t.id AND e.event_type = 'validated'
       GROUP BY t.id, t.schedule_id, b.rows, b.columns
      HAVING count(e.id) > 0
    )
    SELECT s.id AS schedule_id, r.name AS route_name, s.departure_time,
           b.label AS bus_label, max(pt.capacity)::int AS capacity,
           count(*) AS trips_run,
           avg(pt.boarded)::float AS avg_boarded,
           max(pt.boarded)::int AS peak_boarded
      FROM per_trip pt
      JOIN schedules s ON s.id = pt.schedule_id
      JOIN routes r    ON r.id = s.route_id
      JOIN buses b     ON b.id = s.bus_id
     GROUP BY s.id, r.name, s.departure_time, b.label
     ORDER BY avg(pt.boarded) DESC
  `;

  const weekday = await prisma.$queryRaw<
    { schedule_id: string; dow: number; pct: number }[]
  >`
    WITH per_trip AS (
      SELECT t.id, t.schedule_id,
             EXTRACT(DOW FROM t.departure_date)::int AS dow,
             count(e.id) AS boarded,
             (b.rows * array_length(b.columns, 1)) AS capacity
        FROM trips t
        JOIN schedules s ON s.id = t.schedule_id
        JOIN buses b     ON b.id = s.bus_id
        LEFT JOIN ticket_events e ON e.trip_id = t.id AND e.event_type = 'validated'
       GROUP BY t.id, t.schedule_id, t.departure_date, b.rows, b.columns
      HAVING count(e.id) > 0
    )
    SELECT schedule_id, dow, (avg(boarded::float / capacity) * 100)::float AS pct
      FROM per_trip GROUP BY schedule_id, dow
  `;

  return rows.map((r) => {
    const mine = weekday.filter((w) => w.schedule_id === r.schedule_id);
    const avgPct = Math.round((r.avg_boarded / r.capacity) * 100);
    return {
      scheduleId: r.schedule_id,
      routeName: r.route_name,
      departureTime: r.departure_time,
      busLabel: r.bus_label,
      capacity: r.capacity,
      tripsRun: Number(r.trips_run),
      avgBoarded: Math.round(r.avg_boarded),
      avgPct,
      peakPct: Math.round((r.peak_boarded / r.capacity) * 100),
      level: crowdLevel(avgPct),
      byWeekday: [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const hit = mine.find((w) => w.dow === d);
        return { weekday: d, pct: hit ? Math.round(hit.pct) : null };
      }),
    };
  });
}

export async function totals(services: ServiceRow[]): Promise<Totals> {
  const boardings = await prisma.ticketEvent.count({ where: { eventType: "validated" } });
  const tripsRun = services.reduce((a, s) => a + s.tripsRun, 0);
  const weighted = services.reduce((a, s) => a + s.avgPct * s.tripsRun, 0);
  return {
    boardings,
    tripsRun,
    avgPct: tripsRun ? Math.round(weighted / tripsRun) : 0,
    servicesTracked: services.length,
    busiestService: services[0] ? `${services[0].departureTime} ${services[0].routeName}` : null,
    quietestService: services.length > 1
      ? `${services[services.length - 1].departureTime} ${services[services.length - 1].routeName}`
      : null,
  };
}

/** Busiest segments: which stop pairs carry the most passengers. */
export async function topSegments(limit = 6) {
  return prisma.$queryRaw<{ origin: string; destination: string; riders: bigint }[]>`
    SELECT so.name AS origin, sd.name AS destination, count(*) AS riders
      FROM ticket_events e
      JOIN stops so ON so.id = e.origin_stop_id
      JOIN stops sd ON sd.id = e.destination_stop_id
     WHERE e.event_type = 'validated'
     GROUP BY so.name, sd.name
     ORDER BY count(*) DESC
     LIMIT ${limit}
  `;
}
