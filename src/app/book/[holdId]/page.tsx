import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { confirmBookingAction } from "@/app/actions";
import Countdown from "@/components/Countdown";
import { formatTripDate } from "@/lib/trips/date";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "Enter the passenger name.",
  payment_failed: "Payment failed and your hold was released. Pick a seat again.",
  expired: "Your hold expired. Pick a seat again.",
};

export default async function BookPage({
  params,
  searchParams,
}: {
  params: { holdId: string };
  searchParams: { trip?: string; seat?: string; err?: string };
}) {
  const { trip: tripId, seat: seatLabel, err } = searchParams;
  if (!tripId || !seatLabel) notFound();

  const seat = await prisma.seatInventory.findUnique({
    where: { tripId_seatLabel: { tripId, seatLabel } },
    include: {
      trip: {
        include: {
          schedule: {
            include: {
              route: { include: { routeStops: { include: { stop: true }, orderBy: { position: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!seat) notFound();

  const live =
    seat.status === "held" && seat.holdToken === params.holdId && seat.holdExpiresAt && seat.holdExpiresAt > new Date();

  const route = seat.trip.schedule.route;
  const stops = route.routeStops;

  if (!live) {
    return (
      <main className="shell">
        <div className="card">
          <h1>Seat {seatLabel} was released</h1>
          <p className="lede">Your hold ran out and the seat went back into the pool. Nothing was charged.</p>
          <Link className="btn" href={`/trips/${tripId}`}>Choose a seat again</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <Countdown expiresAt={seat.holdExpiresAt!.toISOString()} seatLabel={seatLabel} tripId={tripId} />

      <div className="mast">
        <span className="mast__mark">Passenger details</span>
        <span className="mast__rule" />
      </div>
      <h1>Seat {seatLabel}</h1>
      <p className="lede">
        {route.name} · {formatTripDate(seat.trip.departureDate, { day: "numeric", month: "long" })} at {seat.trip.departureTime}
      </p>

      {err && ERRORS[err] && <div className="notice notice--error">{ERRORS[err]}</div>}

      <form className="card" action={confirmBookingAction}>
        <input type="hidden" name="tripId" value={tripId} />
        <input type="hidden" name="seatLabel" value={seatLabel} />
        <input type="hidden" name="holdToken" value={params.holdId} />

        <div className="field">
          <label htmlFor="passengerName">Passenger name</label>
          <input id="passengerName" name="passengerName" required autoComplete="name" />
        </div>

        <div className="fields fields--2">
        <div className="field">
          <label htmlFor="originStopId">Boarding at</label>
          <select id="originStopId" name="originStopId" required defaultValue={stops[0]?.stopId}>
            {stops.map((s) => <option key={s.id} value={s.stopId}>{s.stop.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="destinationStopId">Getting off at</label>
          <select id="destinationStopId" name="destinationStopId" required defaultValue={stops[stops.length - 1]?.stopId}>
            {stops.map((s) => <option key={s.id} value={s.stopId}>{s.stop.name}</option>)}
          </select>
        </div>
        </div>

        <div className="notice notice--info">
          <strong>Simulated payment.</strong> No real money moves. ₹{(route.fareMinor / 100).toFixed(0)} due on boarding.
        </div>

        <div className="field">
          <label style={{ fontWeight: 400 }}>
            <input type="checkbox" name="forceFailure" style={{ width: "auto", marginRight: 8 }} />
            Force this payment to fail (demo)
          </label>
        </div>

        <button className="btn btn--wide" type="submit">Pay ₹{(route.fareMinor / 100).toFixed(0)} and get my ticket</button>
      </form>
    </main>
  );
}
