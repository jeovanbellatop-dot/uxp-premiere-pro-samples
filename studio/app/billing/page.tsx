import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { PACKS, stripeEnabled } from "../../lib/billing";
import BillingClient from "../../components/BillingClient";

export const dynamic = "force-dynamic";

export default function BillingPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  return <BillingClient credits={user.credits} packs={PACKS} stripe={stripeEnabled()} />;
}
