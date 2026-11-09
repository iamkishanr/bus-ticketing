export function ticketSecret(): string {
  const secret = process.env.TICKET_TOKEN_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error(
      "TICKET_TOKEN_SECRET is unset or shorter than 32 characters. Generate one with: openssl rand -hex 32",
    );
  }
  return secret;
}

export function holdDurationMinutes(): number {
  const raw = Number(process.env.HOLD_DURATION_MINUTES ?? "10");
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

export const adminPasscode = () => process.env.ADMIN_PASSCODE ?? "";
export const conductorPasscode = () => process.env.CONDUCTOR_PASSCODE ?? "";
