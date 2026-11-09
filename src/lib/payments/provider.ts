export type ChargeResult =
  | { status: "succeeded"; providerRef: string }
  | { status: "failed"; reason: string };

/** KTD5: a real gateway later implements this same interface. */
export interface PaymentProvider {
  createCharge(amountMinor: number, bookingRef: string, forceFailure?: boolean): Promise<ChargeResult>;
}
