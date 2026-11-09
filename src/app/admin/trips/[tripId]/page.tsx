import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tripManifest } from "@/lib/trips/manifest";
import { hasRole } from "@/lib/auth";
import { formatTripDate } from "@/lib/trips/date";
import Mast from "@/components/Mast";

export const dynamic = "force-dynamic";

export default async function ManifestPage({ params }: { params: { tripId: string } }) {
  if (!hasRole("admin")) redirect("/admin");

  const m = await tripManifest(params.tripId);
  if (!m) notFound();

  return (
    <main className="shell shell--wide">
      <Mast label="Trip manifest" />
      <h1>{m.trip.schedule.route.name}</h1>
      <p className="lede">
        {formatTripDate(m.trip.departureDate, { weekday: "long", day: "numeric", month: "long" })} at {m.trip.departureTime}
      </p>

      <div className="card">
        <div className="stats">
          <div><div className="stat__n">{m.sold}</div><div className="stat__k">Sold</div></div>
          <div><div className="stat__n">{m.validated}</div><div className="stat__k">Boarded</div></div>
          <div><div className="stat__n">{m.unboarded}</div><div className="stat__k">Not yet boarded</div></div>
        </div>

        <div className="scroller">
        <table>
          <thead><tr><th>Seat</th><th>Passenger</th><th>Reference</th><th>Boarded</th></tr></thead>
          <tbody>
            {m.rows.length === 0 && <tr><td colSpan={4} className="muted">No bookings yet.</td></tr>}
            {m.rows.map((r) => (
              <tr key={r.seatLabel}>
                <td className="mono">{r.seatLabel}</td>
                <td>{r.passengerName}</td>
                <td className="mono">{r.reference}</td>
                <td>{r.boarded ? <span className="state state--used">Boarded</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="footlinks">
        <Link href="/admin">Back to operator</Link>
        <Link href="/admin/overview">Monitor occupancy</Link>
      </div>
    </main>
  );
}
