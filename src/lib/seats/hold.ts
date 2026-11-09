import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { recordEvent } from "../events/record";
import { holdDurationMinutes } from "../config";

export type HoldResult =
  | { ok: true; holdToken: string; expiresAt: Date }
  | { ok: false; reason: "taken" };

/**
 * KTD2: acquire a seat hold with one conditional UPDATE.
 *
 * Correctness rests on Postgres re-evaluating the WHERE predicate after the
 * row lock releases under READ COMMITTED: a concurrent loser sees the
 * committed winner and affects zero rows. No SELECT ... FOR UPDATE needed.
 *
 * KTD6: an expired hold is reclaimable, and reclaiming it writes the `expired`
 * event for the hold it displaces — the only moment that transition is observed.
 */
export async function holdSeat(tripId: string, seatLabel: string): Promise<HoldResult> {
  const minutes = holdDurationMinutes();

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ hold_token: string; hold_expires_at: Date; displaced: boolean }[]>(
      Prisma.sql`
        UPDATE seat_inventory AS si
           SET status = 'held',
               hold_token = gen_random_uuid()::text,
               hold_expires_at = now() + make_interval(mins => ${minutes}::int)
          FROM (SELECT id,
                       (status = 'held' AND hold_expires_at < now()) AS was_expired
                  FROM seat_inventory
                 WHERE trip_id = ${tripId} AND seat_label = ${seatLabel}) AS pre
         WHERE si.id = pre.id
           AND si.trip_id = ${tripId}
           AND si.seat_label = ${seatLabel}
           AND (si.status = 'available'
                OR (si.status = 'held' AND si.hold_expires_at < now()))
        RETURNING si.hold_token, si.hold_expires_at, pre.was_expired AS displaced
      `,
    );

    if (rows.length === 0) return { ok: false, reason: "taken" } as const;

    const row = rows[0];
    if (row.displaced) {
      await recordEvent(tx, { eventType: "expired", tripId, seatLabel });
    }
    await recordEvent(tx, { eventType: "held", tripId, seatLabel });

    return { ok: true, holdToken: row.hold_token, expiresAt: row.hold_expires_at } as const;
  });
}

/** Release a hold back to available (payment failure path, R11). */
export async function releaseHold(tripId: string, seatLabel: string, holdToken: string) {
  await prisma.seatInventory.updateMany({
    where: { tripId, seatLabel, status: "held", holdToken },
    data: { status: "available", holdToken: null, holdExpiresAt: null },
  });
}
