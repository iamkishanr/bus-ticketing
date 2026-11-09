import { redirect } from "next/navigation";
import Link from "next/link";
import Mast from "@/components/Mast";

async function findAction(formData: FormData) {
  "use server";
  const ref = String(formData.get("reference") ?? "").trim().toUpperCase();
  if (ref) redirect(`/booking/${ref}`);
  redirect("/find");
}

export default function FindPage() {
  return (
    <main className="shell">
      <Mast label="Find my booking" />
      <h1>Got your reference?</h1>
      <p className="lede">Enter the 10-character code from your ticket to bring it back up.</p>
      <form className="card" action={findAction}>
        <div className="field">
          <label htmlFor="reference">Booking reference</label>
          <input id="reference" name="reference" required autoCapitalize="characters" className="mono" placeholder="7K2M9PQR4T" />
        </div>
        <button className="btn btn--wide" type="submit">Find my ticket</button>
      </form>
      <div className="footlinks"><Link href="/">Back to search</Link></div>
    </main>
  );
}
