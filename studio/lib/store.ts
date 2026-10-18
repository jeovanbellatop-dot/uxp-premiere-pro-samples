// Per-user data access, backed by SQLite. Media files still live on disk under
// public/generated; everything else is rows keyed by user_id.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "./db";

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

export function getCredits(userId: string): number {
  const row = db.prepare("SELECT credits FROM users WHERE id = ?").get(userId) as { credits: number } | undefined;
  return row?.credits ?? 0;
}

/** Atomically spend credits; throws if the balance is too low. */
export function spendCredits(userId: string, amount: number, reason: string, ref?: string): number {
  const tx = db.transaction(() => {
    const bal = getCredits(userId);
    if (bal < amount) throw new Error("Not enough credits");
    db.prepare("UPDATE users SET credits = credits - ? WHERE id = ?").run(amount, userId);
    db.prepare(
      "INSERT INTO credit_txns (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID(), userId, -amount, reason, ref ?? null, new Date().toISOString());
    return bal - amount;
  });
  return tx();
}

export function addCredits(userId: string, amount: number, reason: string, ref?: string): number {
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(amount, userId);
    db.prepare(
      "INSERT INTO credit_txns (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(randomUUID(), userId, amount, reason, ref ?? null, new Date().toISOString());
    return getCredits(userId);
  });
  return tx();
}

export async function saveDataUrl(dataUrl: string): Promise<string> {
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("Bad data URL");
  const [, mime, b64] = m;
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
  const name = `${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(MEDIA_DIR, name), Buffer.from(b64, "base64"));
  return `/generated/${name}`;
}

// ---- Jobs -------------------------------------------------------------------

export function createJob(userId: string, tool: string, cost: number): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO jobs (id, user_id, tool, status, cost, created_at) VALUES (?, ?, ?, 'running', ?, ?)",
  ).run(id, userId, tool, cost, new Date().toISOString());
  return id;
}

export function finishJob(id: string, assetId: string) {
  db.prepare("UPDATE jobs SET status = 'done', asset_id = ?, finished_at = ? WHERE id = ?")
    .run(assetId, new Date().toISOString(), id);
}

export function failJob(id: string, error: string) {
  db.prepare("UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?")
    .run(error.slice(0, 500), new Date().toISOString(), id);
}

export function getJobs(userId: string, limit = 50) {
  return db
    .prepare("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit);
}

// ---- Assets (library) -------------------------------------------------------

export function addAsset(
  userId: string,
  data: { tool: string; kind: string; prompt: string; output: string; projectId?: string | null },
): Asset {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO assets (id, user_id, project_id, tool, kind, prompt, output, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, userId, data.projectId ?? null, data.tool, data.kind, data.prompt, data.output, now);
  return db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as Asset;
}

export function getAssets(userId: string, projectId?: string, limit = 200): Asset[] {
  if (projectId) {
    return db
      .prepare("SELECT * FROM assets WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, projectId, limit) as Asset[];
  }
  return db
    .prepare("SELECT * FROM assets WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as Asset[];
}

export function assignAssetToProject(userId: string, assetId: string, projectId: string | null) {
  db.prepare("UPDATE assets SET project_id = ? WHERE id = ? AND user_id = ?")
    .run(projectId, assetId, userId);
}

// ---- Projects ---------------------------------------------------------------

export function getProjects(userId: string): Project[] {
  return db
    .prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as Project[];
}

export function createProject(userId: string, name: string): Project {
  const id = randomUUID();
  db.prepare("INSERT INTO projects (id, user_id, name, created_at) VALUES (?, ?, ?, ?)")
    .run(id, userId, name.trim() || "Untitled", new Date().toISOString());
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
}
