// Auth: password hashing (scrypt), sessions, cookie. Pure-JS store (no native deps).

import { scryptSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { data, save } from "./db";

const COOKIE = "studio_session";
const SESSION_DAYS = 30;

export interface User {
  id: string;
  email: string;
  name: string | null;
  credits: number;
  created_at: string;
}

interface UserRow extends User {
  password_hash: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return test.length === known.length && timingSafeEqual(test, known);
}

function sanitize(u: UserRow): User {
  return { id: u.id, email: u.email, name: u.name, credits: u.credits, created_at: u.created_at };
}

export function createUser(email: string, password: string, name?: string): User {
  const now = new Date().toISOString();
  const row: UserRow = {
    id: randomUUID(),
    email: email.toLowerCase().trim(),
    name: name ?? null,
    password_hash: hashPassword(password),
    credits: 100,
    created_at: now,
  };
  data.users.push(row);
  data.creditTxns.push({ id: randomUUID(), user_id: row.id, delta: 100, reason: "signup", ref: null, created_at: now });
  save();
  return sanitize(row);
}

export function getUserByEmail(email: string): UserRow | undefined {
  const e = email.toLowerCase().trim();
  return data.users.find((u) => u.email === e);
}

export function getUserById(id: string): User | undefined {
  const u = data.users.find((x) => x.id === id);
  return u ? sanitize(u) : undefined;
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 864e5);
  data.sessions.push({ token, user_id: userId, created_at: now.toISOString(), expires_at: expires.toISOString() });
  save();
  return token;
}

export function setSessionCookie(token: string): void {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSessionCookie(): void {
  try {
    const token = cookies().get(COOKIE)?.value;
    if (token) {
      const i = data.sessions.findIndex((s) => s.token === token);
      if (i >= 0) { data.sessions.splice(i, 1); save(); }
    }
    cookies().delete(COOKIE);
  } catch {
    // ignore
  }
}

/** Current user from the session cookie, or null. Never throws. */
export function currentUser(): User | null {
  try {
    const token = cookies().get(COOKIE)?.value;
    if (!token) return null;
    const s = data.sessions.find((x) => x.token === token);
    if (!s) return null;
    if (new Date(s.expires_at) < new Date()) {
      const i = data.sessions.findIndex((x) => x.token === token);
      if (i >= 0) { data.sessions.splice(i, 1); save(); }
      return null;
    }
    return getUserById(s.user_id) ?? null;
  } catch {
    return null;
  }
}
