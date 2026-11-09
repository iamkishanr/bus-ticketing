"use client";

import { useEffect, useRef, useState } from "react";
import { validateTicketAction } from "@/app/actions";
import Mast from "./Mast";

type Trip = { id: string; label: string };
type Verdict =
  | { state: "pass"; seatLabel: string; passengerName: string }
  | { state: "fail"; reason: string; detail?: string }
  | { state: "unknown" };

export default function Scanner({ trips }: { trips: Trip[] }) {
  const [tripId, setTripId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const busy = useRef(false);
  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!tripId || verdict) return;
    let cancelled = false;

    (async () => {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      if (cancelled) return;

      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
      scannerRef.current = scanner as unknown as { clear: () => Promise<void> };

      scanner.render(
        async (text: string) => {
          // Pause on the first decode so repeated frames of the same QR
          // cannot turn one physical scan into pass-then-already-used.
          if (busy.current) return;
          busy.current = true;
          try {
            const result = await validateTicketAction(text, tripId);
            if (!cancelled) setVerdict(result);
          } catch {
            if (!cancelled) setVerdict({ state: "unknown" });
          }
        },
        () => { /* per-frame decode misses are normal */ },
      );
    })().catch((e) => {
      if (!cancelled) setCameraError(String(e));
    });

    return () => {
      cancelled = true;
      scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, [tripId, verdict]);

  if (!tripId) {
    return (
      <main className="shell">
        <Mast label="Conductor" />
        <h1>Which service are you on?</h1>
        <p className="lede">Tickets issued for any other service will be refused at the door.</p>
        <div className="card stack">
          {trips.length === 0 && <p className="muted">No trips today. Generate some in the operator area.</p>}
          {trips.map((t) => (
            <button key={t.id} className="btn btn--quiet btn--wide" style={{ justifyContent: "space-between" }} onClick={() => setTripId(t.id)}>
              <span>{t.label}</span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  const current = trips.find((t) => t.id === tripId);

  return (
    <>
      <div className="scanhead">
        <span className="scanhead__svc">{current?.label}</span>
        <button className="btn btn--quiet" onClick={() => { setTripId(null); setVerdict(null); busy.current = false; }}>
          Change service
        </button>
      </div>

      <main className="shell">
        {cameraError ? (
          <div className="notice notice--error">
            <strong>Camera unavailable.</strong>
            <p style={{ margin: "8px 0 0" }}>
              Allow camera access for this site in your browser settings, then tap Try again.
              On iOS Safari: AA menu → Website Settings → Camera → Allow.
            </p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => { setCameraError(null); }}>Try again</button>
          </div>
        ) : (
          <div id="reader" />
        )}
        <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>Point the camera at the passenger&apos;s QR code</p>
      </main>

      {verdict && (
        <div
          className={`verdict verdict--${verdict.state}`}
          role="alert"
          aria-live="assertive"
          onClick={() => { setVerdict(null); busy.current = false; }}
        >
          <div className="verdict__icon" aria-hidden="true">
            {verdict.state === "pass" ? "✓" : verdict.state === "fail" ? "✕" : "?"}
          </div>
          <h2 className="verdict__word">
            {verdict.state === "pass" ? "Valid" : verdict.state === "fail" ? verdict.reason : "Could not verify"}
          </h2>
          {verdict.state === "pass" ? (
            <>
              <div className="verdict__seat">Seat {verdict.seatLabel}</div>
              <div className="verdict__detail">{verdict.passengerName}</div>
            </>
          ) : (
            <div className="verdict__detail">
              {verdict.state === "fail"
                ? verdict.detail
                : "No connection to the server. Check signal and scan again."}
            </div>
          )}
          <button className="btn btn--quiet" style={{ marginTop: 28 }}>Scan next</button>
        </div>
      )}
    </>
  );
}
