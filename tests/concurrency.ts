/**
 * The two release gates. These are the ONLY automated tests in this project.
 *
 * Each fires parallel requests over DISTINCT Prisma clients (separate
 * connections), so a pool that serializes requests cannot produce a passing
 * result — a vacuous pass is the failure mode these gates exist to rule out.
 */
import { PrismaClient } from "@prisma/client";
import { holdSeat } from "../src/lib/seats/hold";
import { confirmBooking } from "../src/lib/bookings/confirm";
import { validateTicket } from "../src/lib/tickets/validate";
import { mintToken } from "../src/lib/tickets/token";

const N = 8;
const admin = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

async function gateSeatHold() {
  const trip = await admin.trip.findFirst({ include: { seats: { take: 1 } } });
  if (!trip?.seats.length) throw new Error("No trips seeded. Run: npm run db:seed");

  const seatLabel = trip.seats[0].seatLabel;
  await admin.seatInventory.updateMany({
    where: { tripId: trip.id, seatLabel },
    data: { status: "available", holdToken: null, holdExpiresAt: null },
  });

  // Distinct clients => distinct connections => genuinely concurrent.
  const clients = Array.from({ length: N }, () => new PrismaClient());
  const settled = await Promise.allSettled(clients.map(() => holdSeat(trip.id, seatLabel)));
  await Promise.all(clients.map((c) => c.$disconnect()));

  const errors = settled.filter((r) => r.status === "rejected");
  const won = settled.filter((r) => r.status === "fulfilled" && r.value.ok).length;

  if (errors.length > 0) {
    const first = (errors[0] as PromiseRejectedResult).reason;
    report("Parallel holds on one seat yield exactly one success", false,
      `${errors.length}/${N} attempts threw. First error: ${String(first).split("\n")[0]}`);
    return;
  }

  report(
    "Parallel holds on one seat yield exactly one success",
    won === 1,
    `${N} parallel attempts on seat ${seatLabel}: ${won} succeeded, ${N - won} reported taken.`,
  );
}

/** The replay gate books its own ticket so it runs from a clean seed. */
async function issueTicket() {
  const trip = await admin.trip.findFirst({
    include: { seats: true, schedule: { include: { route: { include: { routeStops: true } } } } },
  });
  if (!trip) throw new Error("No trips seeded. Run: npm run db:seed");

  const seat = trip.seats.find((s) => s.status === "available");
  if (!seat) throw new Error("No free seat on the first trip. Reset demo data and rerun.");

  const stops = [...trip.schedule.route.routeStops].sort((a, b) => a.position - b.position);
  const hold = await holdSeat(trip.id, seat.seatLabel);
  if (!hold.ok) throw new Error("could not hold a seat for the replay gate");

  const booked = await confirmBooking({
    tripId: trip.id,
    seatLabel: seat.seatLabel,
    holdToken: hold.holdToken,
    passengerName: "Gate Fixture",
    originStopId: stops[0].stopId,
    destinationStopId: stops[stops.length - 1].stopId,
  });
  if (!booked.ok) throw new Error("could not book a seat for the replay gate");

  const booking = await admin.booking.findUnique({
    where: { reference: booked.reference },
    include: { ticket: true },
  });
  return booking!.ticket!;
}

async function gateTicketReplay() {
  const ticket = await issueTicket();

  const token = mintToken(ticket.id);
  const clients = Array.from({ length: N }, () => new PrismaClient());
  const settled = await Promise.allSettled(clients.map(() => validateTicket(token, ticket.tripId)));
  await Promise.all(clients.map((c) => c.$disconnect()));

  const errors = settled.filter((r) => r.status === "rejected");
  if (errors.length > 0) {
    const first = (errors[0] as PromiseRejectedResult).reason;
    report("Parallel scans of one token yield exactly one pass", false,
      `${errors.length}/${N} scans threw. First error: ${String(first).split("\n")[0]}`);
    return;
  }

  const passes = settled.filter((r) => r.status === "fulfilled" && r.value.state === "pass").length;
  report(
    "Parallel scans of one token yield exactly one pass",
    passes === 1,
    `${N} parallel scans of ticket ${ticket.id.slice(0, 8)}: ${passes} passed, ${N - passes} refused.`,
  );
}

(async () => {
  console.log("\nRelease gates\n");
  await gateSeatHold();
  await gateTicketReplay();
  await admin.$disconnect();
  console.log(failures === 0 ? "\nBoth gates pass.\n" : `\n${failures} gate(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
