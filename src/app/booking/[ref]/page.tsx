import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getBookingByReference } from "@/lib/bookings/confirm";
import { cancelBookingAction } from "@/app/actions";
import { formatTripDate } from "@/lib/trips/date";
import Mast from "@/components/Mast";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: { ref: string };
  searchParams: { err?: string };
}) {
  const found = await getBookingByReference(params.ref.toUpperCase());
  if (!found) notFound();

  const { booking, token } = found;
  const status = booking.ticket!.status;
  const qr = token ? await QRCode.toDataURL(token, { width: 520, margin: 1 }) : null;

  const stateLabel = status === "issued" ? "Valid" : status === "used" ? "Boarded" : "Cancelled";

  return (
    <main className="shell">
      <Mast label="Boarding pass" />

      {searchParams.err === "already_used" && (
        <div className="notice notice--error" role="alert">
          This ticket was already scanned at the door, so it cannot be cancelled.
        </div>
      )}

      <div className="ticket">
        <div className="ticket__head">
          <span className="ticket__svc">{booking.trip.schedule.route.name}</span>
          <span className="ticket__dep">{booking.trip.departureTime}</span>
        </div>

        <div className="ticket__body">
          {qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ticket__qr" src={qr} alt="Boarding QR code for this ticket" />
              <p className="muted" style={{ margin: "14px 0 0" }}>Show this to the conductor</p>
            </>
          ) : (
            <>
              <span className={`state state--${status}`}>{stateLabel}</span>
              <p className="muted" style={{ margin: "12px 0 0" }}>
                {status === "used"
                  ? `Boarded at ${booking.ticket!.validatedAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : "This booking was cancelled and the seat released."}
              </p>
            </>
          )}
        </div>

        <hr className="ticket__perf" />

        <div className="ticket__stub">
          <div className="ticket__grid">
            <div className="tk">
              <span className="tk__k">Passenger</span>
              <span className="tk__v">{booking.passengerName}</span>
            </div>
            <div className="tk">
              <span className="tk__k">Seat</span>
              <span className="tk__v mono">{booking.seatLabel}</span>
            </div>
            <div className="tk">
              <span className="tk__k">Date</span>
              <span className="tk__v">{formatTripDate(booking.trip.departureDate, { weekday: "short", day: "numeric", month: "short" })}</span>
            </div>
            <div className="tk">
              <span className="tk__k">Fare</span>
              <span className="tk__v mono">₹{(booking.fareMinor / 100).toFixed(0)}</span>
            </div>
          </div>

          <div className="tk">
            <span className="tk__k">Status</span>
            <span><span className={`state state--${status}`}>{stateLabel}</span></span>
          </div>

          <div>
            <p className="ref" style={{ margin: "6px 0 2px" }}>{booking.reference}</p>
            <p className="muted" style={{ textAlign: "center", margin: 0 }}>
              Booking reference — keep this to find your ticket again
            </p>
          </div>
        </div>
      </div>

      {status === "issued" && (
        <form action={cancelBookingAction} className="card">
          <input type="hidden" name="reference" value={booking.reference} />
          <button className="btn btn--danger" type="submit">Cancel this booking</button>
          <p className="muted" style={{ margin: "10px 0 0" }}>
            The seat returns to the pool and this QR stops working.
          </p>
        </form>
      )}

      <div className="footlinks">
        <Link href="/">Book another trip</Link>
        <Link href="/find">Find a booking</Link>
      </div>
    </main>
  );
}
