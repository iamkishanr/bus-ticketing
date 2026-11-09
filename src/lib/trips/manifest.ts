import { prisma } from "../db";

/** R18: seats sold, validated, unboarded for a trip. */
export async function tripManifest(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      schedule: { include: { route: true, bus: true } },
      bookings: { include: { ticket: true }, orderBy: { seatLabel: "asc" } },
      seats: { orderBy: { seatLabel: "asc" } },
    },
  });
  if (!trip) return null;

  const active = trip.bookings.filter((b) => b.ticket && b.ticket.status !== "cancelled");
  const validated = active.filter((b) => b.ticket!.status === "used");

  return {
    trip,
    sold: active.length,
    validated: validated.length,
    unboarded: active.length - validated.length,
    rows: active.map((b) => ({
      seatLabel: b.seatLabel,
      passengerName: b.passengerName,
      reference: b.reference,
      boarded: b.ticket!.status === "used",
    })),
  };
}
