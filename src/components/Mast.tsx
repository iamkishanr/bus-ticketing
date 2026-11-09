import Link from "next/link";

/**
 * The masthead doubles as the way home from every page. `label` names the
 * current step; the service name beside it is always a link to search.
 */
export default function Mast({ label }: { label?: string }) {
  return (
    <div className="mast">
      {label ? (
        <>
          <Link className="mast__home" href="/">
            City Bus Service
          </Link>
          <span className="mast__sep" aria-hidden="true">/</span>
          <span className="mast__mark">{label}</span>
        </>
      ) : (
        <span className="mast__home mast__home--static">City Bus Service</span>
      )}
      <span className="mast__rule" />
    </div>
  );
}
