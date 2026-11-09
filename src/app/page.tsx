import Link from "next/link";
import { prisma } from "@/lib/db";
import { searchTrips } from "@/lib/trips/search";
import { calendarDay } from "@/lib/trips/date";
import Mast from "@/components/Mast";

export const dynamic = "force-dynamic";

function today() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; date?: string };
}) {
  const stops = await prisma.stop.findMany({ orderBy: { name: "asc" } });
  const { from, to, date } = searchParams;

  const results =
    from && to && date ? await searchTrips(from, to, calendarDay(date)) : null;

  return (
    <main className="shell">
      <Mast />

      <h1>Where are you travelling?</h1>
      <p className="lede">Reserve a numbered seat, pay, and board with a QR ticket.</p>

      <form className="card" method="get">
        <div className="fields fields--2">
        <div className="field">
          <label htmlFor="from">Boarding at</label>
          <select id="from" name="from" defaultValue={from ?? ""} required>
            <option value="" disabled>Choose a stop</option>
            {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">Getting off at</label>
          <select id="to" name="to" defaultValue={to ?? ""} required>
            <option value="" disabled>Choose a stop</option>
            {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="date">Date of travel</label>
          <input id="date" name="date" type="date" defaultValue={date ?? today()} required />
        </div>
        </div>
        <button className="btn" type="submit">Search services</button>
      </form>

      {results && (
        <>
          <h2>{results.length > 0 ? `${results.length} service${results.length === 1 ? "" : "s"} today` : "No services"}</h2>
          <div className="card">
            {results.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                Nothing runs this journey on that date. Try another date.
              </p>
            )}
            <div className="trips">
              {results.map((t) => (
                <div className="trip" key={t.id}>
                  <div className="trip__time">{t.departureTime}</div>
                  <div className="trip__route">
                    <div>{t.routeName}</div>
                    <div className="trip__meta">
                      ₹{(t.fareMinor / 100).toFixed(0)} · {t.seatsAvailable} of {t.seatsTotal} seats free
                    </div>
                  </div>
                  {t.seatsAvailable > 0 ? (
                    <Link className="btn" href={`/trips/${t.id}`}>Choose seat</Link>
                  ) : (
                    <span className="pill">Sold out</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="footlinks">
        <Link href="/find">Find my booking</Link>
        <Link href="/scan">Conductor scanner</Link>
        <Link href="/admin">Operator</Link>
      </div>
    </main>
  );
}
