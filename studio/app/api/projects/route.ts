import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getProjects, createProject, assignAssetToProject } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  return NextResponse.json({ projects: getProjects(user.id) });
}

export async function POST(req: NextRequest) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { name } = (await req.json()) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  return NextResponse.json({ project: createProject(user.id, name) });
}

// Assign an asset to a project (or null to remove).
export async function PATCH(req: NextRequest) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { assetId, projectId } = (await req.json()) as { assetId?: string; projectId?: string | null };
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });
  assignAssetToProject(user.id, assetId, projectId ?? null);
  return NextResponse.json({ ok: true });
}
