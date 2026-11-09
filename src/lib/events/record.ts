import type { Prisma, TicketEventType } from "@prisma/client";

/**
 * The single writer for ticket_events (KTD9). Always called inside the same
 * transaction as the state change it records, so the log can never disagree
 * with booking state.
 */
export async function recordEvent(
  tx: Prisma.TransactionClient,
  event: {
    eventType: TicketEventType;
    tripId: string;
    seatLabel: string;
    ticketId?: string | null;
    originStopId?: string | null;
    destinationStopId?: string | null;
  },
) {
  await tx.ticketEvent.create({
    data: {
      eventType: event.eventType,
      tripId: event.tripId,
      seatLabel: event.seatLabel,
      ticketId: event.ticketId ?? null,
      originStopId: event.originStopId ?? null,
      destinationStopId: event.destinationStopId ?? null,
    },
  });
}
