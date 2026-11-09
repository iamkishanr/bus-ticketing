import { cookies } from "next/headers";
import { adminPasscode, conductorPasscode } from "./config";

export type Role = "admin" | "conductor";

const COOKIE: Record<Role, string> = {
  admin: "bt_admin",
  conductor: "bt_conductor",
};

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

/** Per-client attempt limiting so a static passcode is not freely brute-forceable. */
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function noteFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}

export function expectedPasscode(role: Role): string {
  return role === "admin" ? adminPasscode() : conductorPasscode();
}

export function hasRole(role: Role): boolean {
  const expected = expectedPasscode(role);
  if (!expected) return false;
  return cookies().get(COOKIE[role])?.value === expected;
}

export function grantRole(role: Role) {
  cookies().set(COOKIE[role], expectedPasscode(role), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export function cookieName(role: Role) {
  return COOKIE[role];
}
