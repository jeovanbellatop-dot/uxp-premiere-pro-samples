// Auth: password hashing (scrypt, no extra deps), sessions, and the cookie.

import { scryptSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

const COOKIE = "studio_session";
const SESSION_DAYS = 30;

export interface User {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  created_at: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return test.length === known.length && timingSafeEqual(test, known);
}

export function createUser(email: string, password: string, name?: string): User {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, credits, created_at) VALUES (?, ?, ?, ?, 100, ?)",
  ).run(id, email.toLowerCase().trim(), name ?? null, hashPassword(password), now);
  db.prepare(
    "INSERT INTO credit_txns (id, user_id, delta, reason, created_at) VALUES (?, ?, 100, 'signup', ?)",
  ).run(randomUUID(), id, now);
  return getUserById(id)!;
}

export function getUserByEmail(email: string): (User & { password_hash: string }) | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim()) as any;
}

export function getUserById(id: string): User | undefined {
  return db
    .prepare("SELECT id, email, name, credits, created_at FROM users WHERE id = ?")
    .get(id) as User | undefined;
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 864e5);
  db.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSessionCookie() {
  const token = cookies().get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  cookies().delete(COOKIE);
}

/** Current user from the session cookie, or null. */
export function currentUser(): User | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(token) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return getUserById(row.user_id) ?? null;
}
