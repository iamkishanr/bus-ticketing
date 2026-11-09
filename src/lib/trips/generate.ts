import { prisma } from "../db";
import { seatLabels } from "./seats";
import { todayCalendarDay } from "./date";

/** KTD7: trips are generated over a horizon, idempotent on (schedule, date). */
export async function generateTrips(scheduleId: string, horizonDays = 30) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { bus: true },
  });
  if (!schedule) throw new Error("schedule not found");

  const labels = seatLabels(schedule.bus.rows, schedule.bus.columns);
  const today = todayCalendarDay();
  let created = 0;

  for (let i = 0; i < horizonDays; i++) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + i);
    if (!schedule.weekdays.includes(date.getUTCDay())) continue;

    const existing = await prisma.trip.findUnique({
      where: { scheduleId_departureDate: { scheduleId, departureDate: date } },
    });
    if (existing) continue;

    await prisma.trip.create({
      data: {
        scheduleId,
        departureDate: date,
        departureTime: schedule.departureTime,
        seats: { create: labels.map((seatLabel) => ({ seatLabel })) },
      },
    });
    created++;
  }
  return created;
}
