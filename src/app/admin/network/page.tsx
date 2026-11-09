import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import Mast from "@/components/Mast";
import AdminNav from "@/components/AdminNav";
import { routeImpact } from "@/lib/admin/manage";
import {
  addStopAction, addBusAction, addRouteAction, addScheduleAction,
  retireRouteAction, deleteRouteAction, removeScheduleAction,
} from "./actions";

export const dynamic = "force-dynamic";

const DAYS = [
  { n: 1, l: "Mon" }, { n: 2, l: "Tue" }, { n: 3, l: "Wed" }, { n: 4, l: "Thu" },
  { n: 5, l: "Fri" }, { n: 6, l: "Sat" }, { n: 0, l: "Sun" },
];

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: { done?: string; err?: string; route?: string };
}) {
  if (!hasRole("admin")) redirect("/admin");

  const [stops, buses, routes] = await Promise.all([
    prisma.stop.findMany({ orderBy: { name: "asc" } }),
    prisma.bus.findMany({ orderBy: { label: "asc" } }),
    prisma.route.findMany({
      orderBy: { name: "asc" },
      include: {
        routeStops: { include: { stop: true }, orderBy: { position: "asc" } },
        schedules: { include: { bus: true }, orderBy: { departureTime: "asc" } },
      },
    }),
  ]);

  const selected = searchParams.route
    ? routes.find((r) => r.id === searchParams.route)
    : null;
  const impact = selected ? await routeImpact(selected.id) : null;

  return (
    <main className="shell shell--wide">
      <Mast label="Network" />
      <AdminNav current="network" />

      <h1>Routes, stops and buses</h1>
      <p className="lede">
        Add what the network is made of. A route needs stops in travel order; a service
        pairs a route with a bus and a departure time.
      </p>

      {searchParams.done && <div className="notice notice--info">{searchParams.done}</div>}
      {searchParams.err && <div className="notice notice--error" role="alert">{searchParams.err}</div>}

      <h2>Existing routes</h2>
      <div className="card">
        {routes.length === 0 && <p className="muted" style={{ margin: 0 }}>No routes yet. Add one below.</p>}
        {routes.map((r) => (
          <div key={r.id} className="routerow">
            <div className="routerow__main">
              <strong>{r.name}</strong>
              <div className="muted">
                ₹{(r.fareMinor / 100).toFixed(0)} · {r.routeStops.map((rs) => rs.stop.name).join(" → ")}
              </div>
              {r.schedules.length > 0 ? (
                <div className="routerow__svcs">
                  {r.schedules.map((s) => (
                    <form key={s.id} action={removeScheduleAction} className="chipform">
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <span className="chip">
                        <span className="mono">{s.departureTime}</span>
                        <span className="muted"> · {s.bus.label.replace(/ \(.*/, "")}</span>
                        <button className="chip__x" type="submit" aria-label={`Remove the ${s.departureTime} service`}>×</button>
                      </span>
                    </form>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: "0.82rem" }}>No services yet — add one below.</div>
              )}
            </div>
            <Link className="btn btn--quiet" href={`/admin/network?route=${r.id}`}>Remove route</Link>
          </div>
        ))}
      </div>

      {selected && impact && (
        <>
          <h2>Remove {selected.name}</h2>
          <div className="card">
            <p style={{ marginTop: 0 }}>
              This route has <strong>{impact.schedules} service(s)</strong> and{" "}
              <strong>{impact.trips} trip(s)</strong>, carrying{" "}
              <strong>{impact.soldTickets} ticket(s)</strong>,{" "}
              <strong>{impact.boardedTickets} boarding(s)</strong> and{" "}
              <strong>{impact.events} event(s)</strong> of history.
              {impact.futureTripsWithBookings > 0 && (
                <> {impact.futureTripsWithBookings} future trip(s) already have passengers booked.</>
              )}
            </p>

            <div className="choice">
              <div className="choice__body">
                <strong>Retire it</strong>
                <div className="muted">
                  Stops the route being bookable. Removes services and unbooked future trips.
                  Past trips, tickets and occupancy history are kept.
                </div>
              </div>
              <form action={retireRouteAction}>
                <input type="hidden" name="routeId" value={selected.id} />
                <button className="btn" type="submit">Retire route</button>
              </form>
            </div>

            <div className="choice">
              <div className="choice__body">
                <strong>Delete permanently</strong>
                <div className="muted">
                  {impact.soldTickets > 0 || impact.events > 0
                    ? "Blocked: this route carries ticket and boarding history that deletion would destroy. Retire it instead."
                    : "Allowed: this route has no ticket history. Type DELETE to confirm."}
                </div>
              </div>
              <form action={deleteRouteAction} className="row">
                <input type="hidden" name="routeId" value={selected.id} />
                <input name="confirm" placeholder="DELETE" style={{ width: 120 }}
                       disabled={impact.soldTickets > 0 || impact.events > 0} />
                <button className="btn btn--danger" type="submit"
                        disabled={impact.soldTickets > 0 || impact.events > 0}>Delete</button>
              </form>
            </div>

            <p className="muted" style={{ marginBottom: 0 }}>
              <Link href="/admin/network">Cancel</Link>
            </p>
          </div>
        </>
      )}

      <h2>Add a route</h2>
      <form className="card" action={addRouteAction}>
        <div className="fields fields--2">
          <div className="field">
            <label htmlFor="rname">Route name</label>
            <input id="rname" name="name" required placeholder="Route 210A — Hebbal to Silk Board" />
          </div>
          <div className="field">
            <label htmlFor="fare">Fare in rupees</label>
            <input id="fare" name="fare" type="number" min="1" step="1" required placeholder="65" />
          </div>
        </div>
        <div className="field">
          <label>Stops, in travel order</label>
          <p className="muted" style={{ margin: "0 0 10px" }}>
            Leave the later boxes blank if the route is shorter. At least two stops.
          </p>
          <div className="stopgrid">
            {Array.from({ length: 8 }, (_, i) => (
              <select key={i} name="stopIds" defaultValue="" aria-label={`Stop ${i + 1}`}>
                <option value="">{i < 2 ? `Stop ${i + 1} (required)` : `Stop ${i + 1}`}</option>
                {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ))}
          </div>
        </div>
        <button className="btn" type="submit">Add route</button>
      </form>

      <h2>Add a service to a route</h2>
      <form className="card" action={addScheduleAction}>
        <div className="fields fields--2">
          <div className="field">
            <label htmlFor="sroute">Route</label>
            <select id="sroute" name="routeId" required defaultValue="">
              <option value="" disabled>Choose a route</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sbus">Bus</label>
            <select id="sbus" name="busId" required defaultValue="">
              <option value="" disabled>Choose a bus</option>
              {buses.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="stime">Departure time</label>
          <input id="stime" name="departureTime" type="time" required defaultValue="08:00" />
        </div>
        <div className="field">
          <label>Runs on</label>
          <div className="dayrow">
            {DAYS.map((d) => (
              <label key={d.n} className="daychk">
                <input type="checkbox" name="weekdays" value={d.n} defaultChecked={d.n >= 1 && d.n <= 5} />
                <span>{d.l}</span>
              </label>
            ))}
          </div>
        </div>
        <button className="btn" type="submit">Add service</button>
      </form>

      <h2>Stops and buses</h2>
      <div className="fields fields--2">
        <form className="card" action={addStopAction}>
          <div className="field">
            <label htmlFor="stopname">New stop</label>
            <input id="stopname" name="name" required placeholder="Hebbal" />
          </div>
          <button className="btn btn--quiet" type="submit">Add stop</button>
          <p className="muted" style={{ marginBottom: 0 }}>{stops.length} stops on the network.</p>
        </form>

        <form className="card" action={addBusAction}>
          <div className="field">
            <label htmlFor="blabel">New bus</label>
            <input id="blabel" name="label" required placeholder="KA-03-J-5512 (40 seat)" />
          </div>
          <div className="fields fields--2">
            <div className="field">
              <label htmlFor="brows">Rows</label>
              <input id="brows" name="rows" type="number" min="1" max="30" required defaultValue="10" />
            </div>
            <div className="field">
              <label htmlFor="bcols">Seats per row</label>
              <input id="bcols" name="columns" required defaultValue="A,B,C,D" />
            </div>
          </div>
          <button className="btn btn--quiet" type="submit">Add bus</button>
          <p className="muted" style={{ marginBottom: 0 }}>{buses.length} buses in the fleet.</p>
        </form>
      </div>
    </main>
  );
}
