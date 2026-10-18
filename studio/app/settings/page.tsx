import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { stripeEnabled } from "@/lib/billing";
import AppNav from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  const geminiSet = !!process.env.GEMINI_API_KEY;

  return (
    <div className="wrap">
      <AppNav credits={user.credits} />
      <h2 className="section">Account</h2>
      <div className="runner">
        <p style={{ margin: "4px 0" }}><b>Email:</b> {user.email}</p>
        <p style={{ margin: "4px 0" }}><b>Name:</b> {user.name || "—"}</p>
        <p style={{ margin: "4px 0" }}><b>Credits:</b> {user.credits}</p>
      </div>

      <h2 className="section">Providers</h2>
      <div className="runner">
        <p style={{ margin: "4px 0" }}>
          <b>Gemini API key:</b>{" "}
          {geminiSet
            ? <span style={{ color: "var(--accent)" }}>configured (server-side)</span>
            : <span style={{ color: "var(--danger)" }}>not set — add GEMINI_API_KEY to .env.local</span>}
        </p>
        <p style={{ margin: "4px 0" }}>
          <b>Stripe:</b>{" "}
          {stripeEnabled()
            ? <span style={{ color: "var(--accent)" }}>configured</span>
            : <span style={{ color: "var(--muted)" }}>not set (dev mode — credits add instantly)</span>}
        </p>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>
          Keys live in <code>.env.local</code> on the server and never reach the browser.
        </p>
      </div>
    </div>
  );
}
