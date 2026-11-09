import { prisma } from "../db";
import { recordEvent } from "../events/record";
import { verifyToken } from "./token";

export type Verdict =
  | { state: "pass"; seatLabel: string; passengerName: string }
  | { state: "fail"; reason: string; detail?: string };

/**
 * KTD4: validation is a single conditional UPDATE, so replay cannot race.
 * Zero rows affected means already used, wrong trip, or cancelled; the row is
 * then read to report which.
 */
export async function validateTicket(token: string, scannerTripId: string): Promise<Verdict> {
  const ticketId = verifyToken(token);
  if (!ticketId) {
    return { state: "fail", reason: "NOT A VALID TICKET", detail: "Signature did not verify" };
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.ticket.updateMany({
      where: { id: ticketId, status: "issued", tripId: scannerTripId },
      data: { status: "used", validatedAt: new Date() },
    });

    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: { booking: true, trip: { include: { schedule: { include: { route: true } } } } },
    });

    if (!ticket) {
      return { state: "fail", reason: "NOT A VALID TICKET", detail: "No such ticket" };
    }

    if (updated.count === 0) {
      // Trip mismatch is reported first: a conductor who selected the wrong
      // trip must see that, not a stale "already used" from another service.
      if (ticket.tripId !== scannerTripId) {
        const t = ticket.trip;
        return {
          state: "fail",
          reason: "WRONG TRIP",
          detail: `Ticket is for ${t.schedule.route.name} at ${t.departureTime} — scanner is set to a different trip`,
        };
      }
      if (ticket.status === "used") {
        const when = ticket.validatedAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        return { state: "fail", reason: "ALREADY USED", detail: `Scanned at ${when}` };
      }
      if (ticket.status === "cancelled") {
        return { state: "fail", reason: "CANCELLED", detail: "This booking was cancelled" };
      }
      return { state: "fail", reason: "REJECTED", detail: "Ticket is not valid for boarding" };
    }

    await recordEvent(tx, {
      eventType: "validated",
      tripId: ticket.tripId,
      seatLabel: ticket.booking.seatLabel,
      ticketId: ticket.id,
      originStopId: ticket.booking.originStopId,
      destinationStopId: ticket.booking.destinationStopId,
    });

    return { state: "pass", seatLabel: ticket.booking.seatLabel, passengerName: ticket.booking.passengerName };
  });
}
