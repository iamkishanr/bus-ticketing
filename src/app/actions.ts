"use server";

import { redirect } from "next/navigation";
import { holdSeat } from "@/lib/seats/hold";
import { confirmBooking, cancelBooking } from "@/lib/bookings/confirm";
import { validateTicket } from "@/lib/tickets/validate";
import { grantRole, expectedPasscode, tooManyAttempts, noteFailure, clearAttempts, type Role } from "@/lib/auth";

export async function holdSeatAction(formData: FormData) {
  const tripId = String(formData.get("tripId"));
  const seatLabel = String(formData.get("seatLabel"));

  const result = await holdSeat(tripId, seatLabel);
  if (!result.ok) {
    redirect(`/trips/${tripId}?taken=${encodeURIComponent(seatLabel)}`);
  }
  redirect(`/book/${result.holdToken}?trip=${tripId}&seat=${encodeURIComponent(seatLabel)}`);
}

export async function confirmBookingAction(formData: FormData) {
  const tripId = String(formData.get("tripId"));
  const seatLabel = String(formData.get("seatLabel"));
  const holdToken = String(formData.get("holdToken"));
  const passengerName = String(formData.get("passengerName") ?? "").trim();
  const originStopId = String(formData.get("originStopId"));
  const destinationStopId = String(formData.get("destinationStopId"));
  const forceFailure = formData.get("forceFailure") === "on";

  if (!passengerName) {
    redirect(`/book/${holdToken}?trip=${tripId}&seat=${encodeURIComponent(seatLabel)}&err=name`);
  }

  const result = await confirmBooking({
    tripId, seatLabel, holdToken, passengerName, originStopId, destinationStopId, forceFailure,
  });

  if (!result.ok) {
    redirect(`/book/${holdToken}?trip=${tripId}&seat=${encodeURIComponent(seatLabel)}&err=${result.reason}`);
  }
  redirect(`/booking/${result.reference}`);
}

export async function cancelBookingAction(formData: FormData) {
  const reference = String(formData.get("reference"));
  const result = await cancelBooking(reference);
  redirect(`/booking/${reference}${result.ok ? "" : `?err=${result.reason}`}`);
}

export async function validateTicketAction(token: string, tripId: string) {
  return validateTicket(token, tripId);
}

export async function signInAction(formData: FormData) {
  const role = String(formData.get("role")) as Role;
  const passcode = String(formData.get("passcode") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (tooManyAttempts(role)) {
    redirect(`${next}?err=throttled`);
  }
  if (!expectedPasscode(role) || passcode !== expectedPasscode(role)) {
    noteFailure(role);
    redirect(`${next}?err=passcode`);
  }
  clearAttempts(role);
  grantRole(role);
  redirect(next);
}
