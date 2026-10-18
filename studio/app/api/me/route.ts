import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { getAssets, getProjects } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user,
    assets: getAssets(user.id),
    projects: getProjects(user.id),
  });
}
