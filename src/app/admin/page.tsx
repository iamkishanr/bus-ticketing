import Link from "next/link";
import { prisma } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import { signInAction } from "@/app/actions";
import { generateTripsAction, resetDemoAction } from "./actions";
import { formatTripDate, todayCalendarDay } from "@/lib/trips/date";
import Mast from "@/components/Mast";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: { err?: string; done?: string } }) {
  if (!hasRole("admin")) {
    return (
      <main className="shell">
        <Mast label="Operator" />
        <h1>Operator sign in</h1>
        {searchParams.err === "passcode" && <div className="notice notice--error">Wrong passcode.</div>}
        {searchParams.err === "throttled" && <div className="notice notice--error">Too many attempts. Wait 15 minutes.</div>}
        <form className="card" action={signInAction}>
          <input type="hidden" name="role" value="admin" />
          <input type="hidden" name="next" value="/admin" />
          <div className="field">
            <label htmlFor="passcode">Passcode</label>
            <input id="passcode" name="passcode" type="password" required />
          </div>
          <button className="btn" type="submit">Sign in</button>
        </form>
      </main>
    );
  }

  const [schedules, trips] = await Promise.all([
    prisma.schedule.findMany({ include: { route: true, bus: true } }),
    prisma.trip.findMany({
      where: { departureDate: { gte: todayCalendarDay() } },
      include: { schedule: { include: { route: true } }, _count: { select: { bookings: true } } },
      orderBy: [{ departureDate: "asc" }, { departureTime: "asc" }],
      take: 30,
    }),
  ]);

  return (
    <main className="shell shell--wide">
      <Mast label="Operator" />
      <h1>Services and trips</h1>
      <p className="lede">Define what runs, generate dated trips, and reset the demo.</p>

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <strong>Monitor occupancy</strong>
          <div className="muted">How full every service runs, by day of week, from boarding scans.</div>
        </div>
        <Link className="btn" href="/admin/overview">Open monitor</Link>
      </div>

      {searchParams.done === "reset" && <div className="notice notice--info">Demo data reset. Every trip is empty again.</div>}
      {searchParams.done && searchParams.done !== "reset" && (
        <div className="notice notice--info">Generated {searchParams.done} trips.</div>
      )}

      <h2>Schedules</h2>
      <div className="card">
        <div className="scroller">
        <table>
          <thead><tr><th>Route</th><th>Bus</th><th>Departs</th><th>Days</th><th></th></tr></thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <td>{s.route.name}</td>
                <td>{s.bus.label}</td>
                <td className="mono">{s.departureTime}</td>
                <td className="mono">{s.weekdays.map((d) => "SMTWTFS"[d]).join("")}</td>
                <td>
                  <form action={generateTripsAction}>
                    <input type="hidden" name="scheduleId" value={s.id} />
                    <button className="btn btn--quiet" type="submit">Generate 30 days</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <h2>Upcoming trips</h2>
      <div className="card">
        <div className="scroller">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Route</th><th>Booked</th><th></th></tr></thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id}>
                <td>{formatTripDate(t.departureDate, { day: "numeric", month: "short" })}</td>
                <td className="mono">{t.departureTime}</td>
                <td>{t.schedule.route.name}</td>
                <td className="mono">{t._count.bookings}</td>
                <td><Link href={`/admin/trips/${t.id}`}>Manifest</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <h2>Demo data</h2>
      <form className="card" action={resetDemoAction}>
        <p className="muted" style={{ marginTop: 0 }}>
          Clears every booking, ticket, and event, and frees all seats. Routes and schedules stay.
          Type <strong>RESET</strong> to confirm.
        </p>
        <div className="field">
          <input name="confirm" placeholder="RESET" required />
        </div>
        <button className="btn btn--danger" type="submit">Reset demo data</button>
      </form>

      <div className="footlinks">
        <Link href="/admin/overview">Monitor occupancy</Link>
        <Link href="/">Passenger site</Link>
        <Link href="/scan">Conductor scanner</Link>
      </div>
    </main>
  );
}
