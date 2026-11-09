import Link from "next/link";

type Section = "services" | "network" | "monitor";

/**
 * Persistent operator navigation. Sits under the masthead on every signed-in
 * operator page so sections are reachable without scrolling to the footer.
 */
export default function AdminNav({ current }: { current?: Section }) {
  return (
    <nav className="adminnav" aria-label="Operator sections">
      <div className="adminnav__tabs">
        <Link
          className="adminnav__tab"
          aria-current={current === "services" ? "page" : undefined}
          href="/admin"
        >
          Services &amp; trips
        </Link>
        <Link
          className="adminnav__tab"
          aria-current={current === "network" ? "page" : undefined}
          href="/admin/network"
        >
          Routes &amp; stops
        </Link>
        <Link
          className="adminnav__tab"
          aria-current={current === "monitor" ? "page" : undefined}
          href="/admin/overview"
        >
          Monitor occupancy
        </Link>
      </div>
      <div className="adminnav__aside">
        <Link className="adminnav__out" href="/scan">Scanner</Link>
        <Link className="adminnav__out" href="/">Passenger site</Link>
      </div>
    </nav>
  );
}
