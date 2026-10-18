import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { getAssets, getProjects } from "../../lib/store";
import Studio from "../../components/Studio";

export const dynamic = "force-dynamic";

export default function AppPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  return (
    <Studio
      user={user}
      initialAssets={getAssets(user.id)}
      initialProjects={getProjects(user.id)}
    />
  );
}
