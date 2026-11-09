import { prisma } from "../db";
import { recordEvent } from "../events/record";
import { newReference } from "./reference";
import { simulatedProvider } from "../payments/simulated";
import { mintToken } from "../tickets/token";

export type ConfirmResult =
  | { ok: true; reference: string }
  | { ok: false; reason: "expired" | "payment_failed"; detail?: string };

export async function confirmBooking(input: {
  tripId: string;
  seatLabel: string;
  holdToken: string;
  passengerName: string;
  originStopId: string;
  destinationStopId: string;
  forceFailure?: boolean;
}): Promise<ConfirmResult> {
  const seat = await prisma.seatInventory.findUnique({
    where: { tripId_seatLabel: { tripId: input.tripId, seatLabel: input.seatLabel } },
    include: { trip: { include: { schedule: { include: { route: true } } } } },
  });

  // Refuse an expired hold outright rather than re-acquiring it: a lapse is
  // always a restart, never a charge against a seat search has re-offered.
  const live =
    seat &&
    seat.status === "held" &&
    seat.holdToken === input.holdToken &&
    seat.holdExpiresAt !== null &&
    seat.holdExpiresAt > new Date();

  if (!seat || !live) return { ok: false, reason: "expired" };

  const reference = newReference();
  const fareMinor = seat.trip.schedule.route.fareMinor;

  const charge = await simulatedProvider.createCharge(fareMinor, reference, input.forceFailure);

  if (charge.status === "failed") {
    await prisma.seatInventory.updateMany({
      where: { tripId: input.tripId, seatLabel: input.seatLabel, holdToken: input.holdToken },
      data: { status: "available", holdToken: null, holdExpiresAt: null },
    });
    return { ok: false, reason: "payment_failed", detail: charge.reason };
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.seatInventory.updateMany({
      where: { tripId: input.tripId, seatLabel: input.seatLabel, status: "held", holdToken: input.holdToken },
      data: { status: "booked", holdToken: null, holdExpiresAt: null },
    });
    if (claimed.count === 0) throw new Error("hold lost during payment");

    const booking = await tx.booking.create({
      data: {
        reference,
        tripId: input.tripId,
        seatLabel: input.seatLabel,
        passengerName: input.passengerName,
        originStopId: input.originStopId,
        destinationStopId: input.destinationStopId,
        fareMinor,
        paymentProviderRef: charge.providerRef,
      },
    });

    const ticket = await tx.ticket.create({
      data: { bookingId: booking.id, tripId: input.tripId },
    });

    const common = {
      tripId: input.tripId,
      seatLabel: input.seatLabel,
      ticketId: ticket.id,
      originStopId: input.originStopId,
      destinationStopId: input.destinationStopId,
    };
    await recordEvent(tx, { ...common, eventType: "paid" });
    await recordEvent(tx, { ...common, eventType: "issued" });
  });

  return { ok: true, reference };
}

export async function getBookingByReference(reference: string) {
  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: {
      ticket: true,
      trip: { include: { schedule: { include: { route: true, bus: true } } } },
    },
  });
  if (!booking) return null;
  return {
    booking,
    token: booking.ticket && booking.ticket.status === "issued" ? mintToken(booking.ticket.id) : null,
  };
}

export async function cancelBooking(reference: string): Promise<{ ok: boolean; reason?: string }> {
  const booking = await prisma.booking.findUnique({ where: { reference }, include: { ticket: true } });
  if (!booking || !booking.ticket) return { ok: false, reason: "not_found" };
  if (booking.ticket.status === "used") return { ok: false, reason: "already_used" };
  if (booking.ticket.status === "cancelled") return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: booking.ticket!.id }, data: { status: "cancelled" } });
    await tx.seatInventory.updateMany({
      where: { tripId: booking.tripId, seatLabel: booking.seatLabel },
      data: { status: "available", holdToken: null, holdExpiresAt: null },
    });
    await recordEvent(tx, {
      eventType: "cancelled",
      tripId: booking.tripId,
      seatLabel: booking.seatLabel,
      ticketId: booking.ticket!.id,
      originStopId: booking.originStopId,
      destinationStopId: booking.destinationStopId,
    });
  });

  return { ok: true };
}
