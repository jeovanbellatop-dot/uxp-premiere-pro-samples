import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getPack, stripeEnabled, stripe } from "@/lib/billing";
import { addCredits } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { packId } = (await req.json()) as { packId?: string };
  const pack = packId ? getPack(packId) : undefined;
  if (!pack) return NextResponse.json({ error: "Unknown pack" }, { status: 400 });

  // Dev mode: no Stripe key -> credit immediately so the flow is testable.
  if (!stripeEnabled()) {
    const balance = addCredits(user.id, pack.credits, "purchase", `dev:${pack.id}`);
    return NextResponse.json({ simulated: true, balance });
  }

  const origin = req.headers.get("origin") || req.nextUrl.origin;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          product_data: { name: `${pack.name} — ${pack.credits} credits` },
        },
      },
    ],
    client_reference_id: user.id,
    metadata: { userId: user.id, packId: pack.id, credits: String(pack.credits) },
    success_url: `${origin}/billing?status=success`,
    cancel_url: `${origin}/billing?status=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
