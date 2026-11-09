import { prisma } from "../db";

export type CrowdLevel = "quiet" | "seats" | "full";

export const CROWD_COPY: Record<CrowdLevel, string> = {
  quiet: "Usually quiet",
  seats: "Seats usually free",
  full: "Usually busy",
};

export function crowdLevel(pct: number): CrowdLevel {
  if (pct < 40) return "quiet";
  if (pct < 80) return "seats";
  return "full";
}

export type Forecast = { samples: number; expectedPct: number; level: CrowdLevel };

/**
 * Forecast how full a service will be, from validated boarding events alone.
 *
 * The comparable group is (schedule, weekday): the same service on the same day
 * of the week. Trips are generated from a route plus a weekly schedule, so that
 * grouping already exists. Nothing here needs new instrumentation.
 */
export async function forecast(
  scheduleId: string,
  weekday: number,
  asOf: Date,
): Promise<Forecast | null> {
  const rows = await prisma.$queryRaw<{ boarded: bigint; capacity: number }[]>`
    SELECT count(e.id) AS boarded,
           (b.rows * array_length(b.columns, 1)) AS capacity
      FROM trips t
      JOIN schedules s ON s.id = t.schedule_id
      JOIN buses b     ON b.id = s.bus_id
      LEFT JOIN ticket_events e
             ON e.trip_id = t.id AND e.event_type = 'validated'
     WHERE t.schedule_id = ${scheduleId}
       AND EXTRACT(DOW FROM t.departure_date) = ${weekday}
       AND t.departure_date < ${asOf}
     GROUP BY t.id, b.rows, b.columns
  `;
  const withHistory = rows.filter((r) => Number(r.boarded) > 0);
  if (withHistory.length < 2) return null;

  const pcts = withHistory.map((r) => (Number(r.boarded) / r.capacity) * 100);
  const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  return { samples: pcts.length, expectedPct: Math.round(mean), level: crowdLevel(mean) };
}

/** Forecasts for many trips at once, keyed by trip id. */
export async function forecastTrips(
  trips: { id: string; scheduleId: string; departureDate: Date }[],
): Promise<Record<string, Forecast>> {
  const out: Record<string, Forecast> = {};
  await Promise.all(
    trips.map(async (t) => {
      const f = await forecast(t.scheduleId, t.departureDate.getUTCDay(), t.departureDate);
      if (f) out[t.id] = f;
    }),
  );
  return out;
}
