import { prisma } from "@/lib/db";
import { hasRole } from "@/lib/auth";
import { signInAction } from "@/app/actions";
import Scanner from "@/components/Scanner";
import { todayCalendarDay } from "@/lib/trips/date";
import Mast from "@/components/Mast";

export const dynamic = "force-dynamic";

export default async function ScanPage({ searchParams }: { searchParams: { err?: string } }) {
  if (!hasRole("conductor")) {
    return (
      <main className="shell">
        <Mast label="Conductor" />
        <h1>Conductor sign in</h1>
        <p className="lede">Enter the conductor passcode to open the scanner.</p>
        {searchParams.err === "passcode" && <div className="notice notice--error">Wrong passcode.</div>}
        {searchParams.err === "throttled" && (
          <div className="notice notice--error">Too many attempts. Wait 15 minutes.</div>
        )}
        <form className="card" action={signInAction}>
          <input type="hidden" name="role" value="conductor" />
          <input type="hidden" name="next" value="/scan" />
          <div className="field">
            <label htmlFor="passcode">Passcode</label>
            <input id="passcode" name="passcode" type="password" required />
          </div>
          <button className="btn" type="submit">Open scanner</button>
        </form>
      </main>
    );
  }

  const today = todayCalendarDay();

  const trips = await prisma.trip.findMany({
    where: { departureDate: today },
    include: { schedule: { include: { route: true } } },
    orderBy: { departureTime: "asc" },
  });

  return (
    <Scanner
      trips={trips.map((t) => ({
        id: t.id,
        label: `${t.departureTime} · ${t.schedule.route.name}`,
      }))}
    />
  );
}
