"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { hasRole } from "@/lib/auth";
import {
  createStop, createBus, createRoute, createSchedule,
  retireRoute, deleteRoute, removeSchedule,
} from "@/lib/admin/manage";

function guard() {
  if (!hasRole("admin")) redirect("/admin");
}

function back(msg: string, error = false) {
  revalidatePath("/admin/network");
  redirect(`/admin/network?${error ? "err" : "done"}=${encodeURIComponent(msg)}`);
}

export async function addStopAction(fd: FormData) {
  guard();
  const r = await createStop(String(fd.get("name") ?? ""));
  back(r.ok ? "Stop added." : r.error, !r.ok);
}

export async function addBusAction(fd: FormData) {
  guard();
  const cols = String(fd.get("columns") ?? "").split(",").map(c => c.trim().toUpperCase()).filter(Boolean);
  const r = await createBus(String(fd.get("label") ?? ""), Number(fd.get("rows")), cols);
  back(r.ok ? "Bus added." : r.error, !r.ok);
}

export async function addRouteAction(fd: FormData) {
  guard();
  const stopIds = fd.getAll("stopIds").map(String);
  const r = await createRoute(String(fd.get("name") ?? ""), Number(fd.get("fare")), stopIds);
  back(r.ok ? "Route added. Add a service to it next." : r.error, !r.ok);
}

export async function addScheduleAction(fd: FormData) {
  guard();
  const weekdays = fd.getAll("weekdays").map(Number);
  const r = await createSchedule(
    String(fd.get("routeId") ?? ""), String(fd.get("busId") ?? ""),
    String(fd.get("departureTime") ?? ""), weekdays,
  );
  back(r.ok ? "Service added. Generate trips from Services & trips." : r.error, !r.ok);
}

export async function retireRouteAction(fd: FormData) {
  guard();
  const r = await retireRoute(String(fd.get("routeId") ?? ""));
  back(`Route retired. Removed ${r.removedTrips} unbooked future trip(s); kept ${r.keptTrips} trip(s) with history.`);
}

export async function deleteRouteAction(fd: FormData) {
  guard();
  if (String(fd.get("confirm")) !== "DELETE") back("Type DELETE to confirm.", true);
  const r = await deleteRoute(String(fd.get("routeId") ?? ""));
  back(r.ok ? "Route deleted." : r.error, !r.ok);
}

export async function removeScheduleAction(fd: FormData) {
  guard();
  const r = await removeSchedule(String(fd.get("scheduleId") ?? ""));
  back(r.detail);
}
