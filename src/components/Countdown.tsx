"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Countdown({
  expiresAt,
  seatLabel,
  tripId,
}: {
  expiresAt: string;
  seatLabel: string;
  tripId: string;
}) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (left === 0) {
    return (
      <div className="notice notice--error" role="alert">
        Your hold on {seatLabel} expired.{" "}
        <Link href={`/trips/${tripId}`}>Choose a seat again</Link>
      </div>
    );
  }

  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  const warn = left < 60000;

  return (
    <div className="countdown" data-warn={warn} aria-live="polite">
      <span>Seat {seatLabel} held for you</span>
      <strong>{mins}:{String(secs).padStart(2, "0")}</strong>
    </div>
  );
}
