import Link from "next/link";
import { notFound } from "next/navigation";
import { getTripWithSeats } from "@/lib/trips/search";
import { holdSeatAction } from "@/app/actions";
import { formatTripDate } from "@/lib/trips/date";
import Mast from "@/components/Mast";

export const dynamic = "force-dynamic";

export default async function TripPage({
  params,
  searchParams,
}: {
  params: { tripId: string };
  searchParams: { taken?: string };
}) {
  const trip = await getTripWithSeats(params.tripId);
  if (!trip) notFound();

  const now = new Date();
  const columns = trip.schedule.bus.columns;
  const split = Math.ceil(columns.length / 2);

  const stateOf = (s: (typeof trip.seats)[number]) => {
    if (s.status === "booked") return "booked";
    if (s.status === "held" && s.holdExpiresAt && s.holdExpiresAt > now) return "held";
    return "available";
  };
  const mark = { available: "", held: "◷", booked: "✕", mine: "✓" } as const;

  const rows = Array.from({ length: trip.schedule.bus.rows }, (_, i) => i + 1);
  const available = trip.seats.filter((s) => stateOf(s) === "available").length;

  return (
    <main className="shell">
      <Mast label="Choose your seat" />
      <h1>{trip.schedule.route.name}</h1>
      <p className="lede">
        {formatTripDate(trip.departureDate, { weekday: "long", day: "numeric", month: "long" })} at{" "}
        {trip.departureTime} · {trip.schedule.bus.label} · {available} of {trip.seats.length} seats free
      </p>

      {searchParams.taken && (
        <div className="notice notice--error" role="alert">
          Seat {searchParams.taken} was taken while you were choosing. Pick another.
        </div>
      )}

      <div className="card">
        <div className="deck">
          <div className="deck__nose">Front of bus</div>
          {rows.map((r) => (
            <div className="seatrow" key={r}>
              {columns.map((c, idx) => {
                const label = `${r}${c}`;
                const seat = trip.seats.find((s) => s.seatLabel === label);
                if (!seat) return null;
                const state = stateOf(seat);
                return (
                  <>
                    {idx === split && <div className="aisle" key={`a${r}`} />}
                    <form action={holdSeatAction} key={label} style={{ display: "contents" }}>
                      <input type="hidden" name="tripId" value={trip.id} />
                      <input type="hidden" name="seatLabel" value={label} />
                      <button
                        className="seat"
                        data-state={state}
                        type="submit"
                        disabled={state !== "available"}
                        aria-label={`${label}, ${state === "available" ? "available" : state === "held" ? "on hold" : "booked"}`}
                      >
                        {label}
                        <span className="seat__mark" aria-hidden="true">{mark[state]}</span>
                      </button>
                    </form>
                  </>
                );
              })}
            </div>
          ))}
        </div>

        <div className="legend">
          <span><i className="swatch" /> Available</span>
          <span><i className="swatch swatch--held" /> On hold</span>
          <span><i className="swatch swatch--booked" /> Booked</span>
        </div>
      </div>

      <div className="footlinks">
        <Link href="/">Back to search</Link>
        <Link href="/find">Find my booking</Link>
      </div>
    </main>
  );
}
