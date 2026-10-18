// Per-user data access on the pure-JS store (no native deps). Media files still
// live on disk under public/generated.

import { promises as fsp } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { data, save } from "./db";

const MEDIA_DIR = path.join(process.cwd(), "public", "generated");

export interface Asset {
  id: string;
  user_id: string;
  project_id: string | null;
  tool: string;
  kind: string;
  prompt: string;
  output: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

function user(userId: string) {
  return data.users.find((u) => u.id === userId);
}

export function getCredits(userId: string): number {
  return user(userId)?.credits ?? 0;
}

export function spendCredits(userId: string, amount: number, reason: string, ref?: string): number {
  const u = user(userId);
  if (!u) throw new Error("User not found");
  if (u.credits < amount) throw new Error("Not enough credits");
  u.credits -= amount;
  data.creditTxns.push({ id: randomUUID(), user_id: userId, delta: -amount, reason, ref: ref ?? null, created_at: new Date().toISOString() });
  save();
  return u.credits;
}

export function addCredits(userId: string, amount: number, reason: string, ref?: string): number {
  const u = user(userId);
  if (!u) throw new Error("User not found");
  u.credits += amount;
  data.creditTxns.push({ id: randomUUID(), user_id: userId, delta: amount, reason, ref: ref ?? null, created_at: new Date().toISOString() });
  save();
  return u.credits;
}

export async function saveDataUrl(dataUrl: string): Promise<string> {
  await fsp.mkdir(MEDIA_DIR, { recursive: true });
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("Bad data URL");
  const [, mime, b64] = m;
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  const name = `${randomUUID()}.${ext}`;
  await fsp.writeFile(path.join(MEDIA_DIR, name), Buffer.from(b64, "base64"));
  return `/generated/${name}`;
}

// ---- Jobs -------------------------------------------------------------------

export function createJob(userId: string, tool: string, cost: number): string {
  const id = randomUUID();
  data.jobs.push({ id, user_id: userId, tool, status: "running", cost, error: null, asset_id: null, created_at: new Date().toISOString(), finished_at: null });
  save();
  return id;
}

function job(id: string) {
  return data.jobs.find((j) => j.id === id);
}

export function finishJob(id: string, assetId: string): void {
  const j = job(id);
  if (j) { j.status = "done"; j.asset_id = assetId; j.finished_at = new Date().toISOString(); save(); }
}

export function failJob(id: string, error: string): void {
  const j = job(id);
  if (j) { j.status = "failed"; j.error = (error || "").slice(0, 500); j.finished_at = new Date().toISOString(); save(); }
}

export function getJobs(userId: string, limit = 50) {
  return data.jobs.filter((j) => j.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

// ---- Assets (library) -------------------------------------------------------

export function addAsset(
  userId: string,
  d: { tool: string; kind: string; prompt: string; output: string; projectId?: string | null },
): Asset {
  const asset: Asset = {
    id: randomUUID(), user_id: userId, project_id: d.projectId ?? null,
    tool: d.tool, kind: d.kind, prompt: d.prompt, output: d.output,
    created_at: new Date().toISOString(),
  };
  data.assets.push(asset);
  save();
  return asset;
}

export function getAssets(userId: string, projectId?: string, limit = 200): Asset[] {
  return data.assets
    .filter((a) => a.user_id === userId && (!projectId || a.project_id === projectId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export function assignAssetToProject(userId: string, assetId: string, projectId: string | null): void {
  const a = data.assets.find((x) => x.id === assetId && x.user_id === userId);
  if (a) { a.project_id = projectId; save(); }
}

// ---- Projects ---------------------------------------------------------------

export function getProjects(userId: string): Project[] {
  return data.projects
    .filter((p) => p.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createProject(userId: string, name: string): Project {
  const project: Project = {
    id: randomUUID(), user_id: userId, name: (name || "").trim() || "Untitled",
    created_at: new Date().toISOString(),
  };
  data.projects.push(project);
  save();
  return project;
}
