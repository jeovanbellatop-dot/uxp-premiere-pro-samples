// Credit packs + Stripe helper. Stripe is optional: without STRIPE_SECRET_KEY
// the checkout route falls back to crediting the account directly (dev mode).

import Stripe from "stripe";

export interface Pack {
  id: string;
  name: string;
  credits: number;
  priceCents: number; // USD cents
}

export const PACKS: Pack[] = [
  { id: "starter", name: "Starter", credits: 200, priceCents: 500 },
  { id: "creator", name: "Creator", credits: 1000, priceCents: 2000 },
  { id: "studio", name: "Studio", credits: 5000, priceCents: 8000 },
];

export function getPack(id: string): Pack | undefined {
  return PACKS.find((p) => p.id === id);
}

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not set");
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}
