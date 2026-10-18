import { NextRequest, NextResponse } from "next/server";
import { stripe, stripeEnabled } from "../../../../lib/billing";
import { addCredits } from "../../../../lib/store";
import { db } from "../../../../lib/db";

export const runtime = "nodejs";

// Stripe calls this after a successful payment. Set STRIPE_WEBHOOK_SECRET and
// point a webhook at /api/billing/webhook (events: checkout.session.completed).
export async function POST(req: NextRequest) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 400 });

  const sig = req.headers.get("stripe-signature") || "";
  const body = await req.text();

  let event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Bad signature: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as any;
    const userId = s.metadata?.userId;
    const credits = Number(s.metadata?.credits || 0);
    // Idempotency: don't double-credit the same checkout session.
    const seen = db.prepare("SELECT 1 FROM credit_txns WHERE ref = ?").get(`stripe:${s.id}`);
    if (userId && credits > 0 && !seen) {
      addCredits(userId, credits, "purchase", `stripe:${s.id}`);
    }
  }
  return NextResponse.json({ received: true });
}
