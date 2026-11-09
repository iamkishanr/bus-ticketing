import Link from "next/link";
import { prisma } from "@/lib/db";
import { searchTrips, todaysServices } from "@/lib/trips/search";
import { calendarDay } from "@/lib/trips/date";
import { forecastTrips, CROWD_COPY } from "@/lib/crowd/estimate";
import { originStops, destinationStops } from "@/lib/trips/reachable";
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
  const { from, to, date } = searchParams;

  // Only offer stops that actually lead somewhere, and only destinations the
  // chosen origin can reach. Offering all 26 x 26 pairs makes most searches
  // return nothing.
  const origins = await originStops();
  const destinations = from ? await destinationStops(from) : [];

  const results =
    from && to && date ? await searchTrips(from, to, calendarDay(date)) : null;

  // With no search yet, show today's departures so the page is useful at rest.
  const departingToday = results === null ? await todaysServices(10) : [];

  // Crowd forecast from past validated boardings on the same service and weekday
  const crowd = await forecastTrips(results ?? departingToday);

  return (
    <main className="shell">
      <Mast />

      <h1>Where are you travelling?</h1>
      <p className="lede">Reserve a numbered seat, pay, and board with a QR ticket.</p>

      <form className="card" method="get" id="searchForm">
        <div className="fields fields--2">
        <div className="field">
          <label htmlFor="from">Boarding at</label>
          <select id="from" name="from" defaultValue={from ?? ""} required>
            <option value="" disabled>Choose a stop</option>
            {origins.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">Getting off at</label>
          <select id="to" name="to" defaultValue={to ?? ""} required disabled={!from}>
            <option value="" disabled>
              {from ? "Choose a stop" : "Pick a boarding stop first"}
            </option>
            {destinations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {from && (
            <p className="muted" style={{ margin: "7px 0 0", fontSize: "0.8rem" }}>
              {destinations.length} stop{destinations.length === 1 ? "" : "s"} reachable from here.
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="date">Date of travel</label>
          <input id="date" name="date" type="date" defaultValue={date ?? today()} required />
        </div>
        </div>
        <button className="btn" type="submit">Search services</button>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.getElementById('from').addEventListener('change',function(){" +
              "var f=document.getElementById('searchForm');" +
              "document.getElementById('to').value='';f.submit();});",
          }}
        />
      </form>

      {results === null && departingToday.length > 0 && (
        <>
          <h2>Departing today</h2>
          <div className="card">
            <div className="trips">
              {departingToday.map((t) => (
                <div className="trip" key={t.id}>
                  <div className="trip__time">{t.departureTime}</div>
                  <div className="trip__route">
                    <div>{t.routeName}</div>
                    <div className="trip__meta">
                      {t.originName} → {t.destinationName} · {t.stopCount} stops · ₹{(t.fareMinor / 100).toFixed(0)}
                    </div>
                    {crowd[t.id] && (
                      <div className={`crowd crowd--${crowd[t.id].level}`}>
                        <span className="crowd__bars" aria-hidden="true"><i /><i /><i /></span>
                        <span>{CROWD_COPY[crowd[t.id].level]} · about {crowd[t.id].expectedPct}% full</span>
                      </div>
                    )}
                  </div>
                  {t.seatsAvailable > 0 ? (
                    <Link className="btn" href={`/trips/${t.id}`}>
                      Choose seat
                      <span className="muted" style={{ color: "inherit", opacity: 0.8, fontWeight: 400 }}>
                        {" "}· {t.seatsAvailable} free
                      </span>
                    </Link>
                  ) : (
                    <span className="pill">Sold out</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="muted">
            Showing today&apos;s departures. Search above for another date or a specific journey.
          </p>
        </>
      )}

      {results && (
        <>
          <h2>{results.length > 0 ? `${results.length} service${results.length === 1 ? "" : "s"} today` : "No services"}</h2>
          <div className="card">
            {results.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                No service runs this journey on {new Date(date!).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.
                Some services do not run every day — try another date, or a different pair of stops.
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
                    {crowd[t.id] && (
                      <div className={`crowd crowd--${crowd[t.id].level}`}>
                        <span className="crowd__bars" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                        <span>
                          {CROWD_COPY[crowd[t.id].level]} · about {crowd[t.id].expectedPct}% full
                        </span>
                      </div>
                    )}
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
