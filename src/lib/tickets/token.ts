import { createHmac, timingSafeEqual } from "node:crypto";
import { ticketSecret } from "../config";

/**
 * KTD3: the QR carries an opaque signed token, never booking data.
 * The ticket row stays the authority for paid/used/trip state; the signature
 * only proves this server issued the token.
 */
export function mintToken(ticketId: string): string {
  const sig = createHmac("sha256", ticketSecret()).update(ticketId).digest("base64url");
  return `${ticketId}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const ticketId = token.slice(0, dot);
  const presented = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", ticketSecret()).update(ticketId).digest();

  if (presented.length !== expected.length) return null;
  if (!timingSafeEqual(presented, expected)) return null;

  return ticketId;
}
