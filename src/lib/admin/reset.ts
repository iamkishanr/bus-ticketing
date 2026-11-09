import { prisma } from "../db";

/**
 * R20: restore every trip to empty inventory. TRUNCATE is the sanctioned bulk
 * clear; the event-immutability rule blocks row-level UPDATE and DELETE only.
 */
export async function resetDemoData() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ticket_events, tickets, bookings RESTART IDENTITY CASCADE`,
  );
  await prisma.seatInventory.updateMany({
    data: { status: "available", holdToken: null, holdExpiresAt: null },
  });
}
