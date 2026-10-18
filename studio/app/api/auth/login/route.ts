import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, verifyPassword, createSession, setSessionCookie, getUserById } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    const row = getUserByEmail(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
    }
    setSessionCookie(createSession(row.id));
    return NextResponse.json({ user: getUserById(row.id) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Login failed" }, { status: 500 });
  }
}
