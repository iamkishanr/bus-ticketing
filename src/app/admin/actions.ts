"use server";

import { redirect } from "next/navigation";
import { generateTrips } from "@/lib/trips/generate";
import { resetDemoData } from "@/lib/admin/reset";
import { hasRole } from "@/lib/auth";

export async function generateTripsAction(formData: FormData) {
  if (!hasRole("admin")) redirect("/admin");
  const count = await generateTrips(String(formData.get("scheduleId")), 30);
  redirect(`/admin?done=${count}`);
}

export async function resetDemoAction(formData: FormData) {
  if (!hasRole("admin")) redirect("/admin");
  if (String(formData.get("confirm")) !== "RESET") redirect("/admin");
  await resetDemoData();
  redirect("/admin?done=reset");
}
