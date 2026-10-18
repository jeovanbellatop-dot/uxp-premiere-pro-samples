import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { stripeEnabled } from "../../lib/billing";
import AppNav from "../../components/AppNav";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  const geminiSet = !!process.env.GEMINI_API_KEY;

  return (
    <div className="wrap">
      <AppNav credits={user.credits} />
      <h2 className="section">Conta</h2>
      <div className="runner">
        <p style={{ margin: "4px 0" }}><b>E-mail:</b> {user.email}</p>
        <p style={{ margin: "4px 0" }}><b>Nome:</b> {user.name || "—"}</p>
        <p style={{ margin: "4px 0" }}><b>Créditos:</b> {user.credits}</p>
      </div>

      <h2 className="section">Integrações</h2>
      <div className="runner">
        <p style={{ margin: "4px 0" }}>
          <b>Chave do Gemini:</b>{" "}
          {geminiSet
            ? <span style={{ color: "var(--accent)" }}>configurada (no servidor)</span>
            : <span style={{ color: "var(--danger)" }}>não configurada — defina GEMINI_API_KEY</span>}
        </p>
        <p style={{ margin: "4px 0" }}>
          <b>Stripe:</b>{" "}
          {stripeEnabled()
            ? <span style={{ color: "var(--accent)" }}>configurado</span>
            : <span style={{ color: "var(--muted)" }}>não configurado (modo de teste — créditos na hora)</span>}
        </p>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>
          As chaves ficam só no servidor e nunca chegam ao navegador.
        </p>
      </div>
    </div>
  );
}
