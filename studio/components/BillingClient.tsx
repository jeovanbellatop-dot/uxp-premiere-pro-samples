"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppNav from "./AppNav";

interface Pack { id: string; name: string; credits: number; priceCents: number; }

export default function BillingClient({
  credits, packs, stripe,
}: { credits: number; packs: Pack[]; stripe: boolean }) {
  const router = useRouter();
  const [balance, setBalance] = useState(credits);
  const [busy, setBusy] = useState<string>();
  const [msg, setMsg] = useState<string>();

  async function buy(packId: string) {
    setBusy(packId); setMsg(undefined);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.url) { window.location.href = data.url; return; } // Stripe checkout
      if (data.simulated) { setBalance(data.balance); setMsg("Credits added (dev mode — no Stripe key set)."); router.refresh(); }
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="wrap">
      <AppNav credits={balance} />
      <h2 className="section">Buy credits</h2>
      {!stripe && (
        <p className="empty" style={{ marginBottom: 12 }}>
          Dev mode: no <code>STRIPE_SECRET_KEY</code> set, so buying credits them instantly for testing.
          Add Stripe keys to <code>.env.local</code> for real checkout.
        </p>
      )}
      <div className="grid">
        {packs.map((p) => (
          <div className="card" key={p.id} style={{ cursor: "default" }}>
            <div className="area">{p.name}</div>
            <h3>{p.credits} credits</h3>
            <p>${(p.priceCents / 100).toFixed(2)}</p>
            <div className="row">
              <button className="primary" onClick={() => buy(p.id)} disabled={!!busy}>
                {busy === p.id ? <><span className="spinner" /> &nbsp;…</> : "Buy"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {msg && <p style={{ color: "var(--accent)", marginTop: 14 }}>{msg}</p>}
    </div>
  );
}
