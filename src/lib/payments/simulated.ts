import type { PaymentProvider, ChargeResult } from "./provider";

/** Simulated provider: real flow, no real money (KTD5). */
export const simulatedProvider: PaymentProvider = {
  async createCharge(_amountMinor, bookingRef, forceFailure): Promise<ChargeResult> {
    await new Promise((r) => setTimeout(r, 400));
    if (forceFailure) {
      return { status: "failed", reason: "Card declined (simulated)" };
    }
    return { status: "succeeded", providerRef: `sim_${bookingRef}` };
  },
};
