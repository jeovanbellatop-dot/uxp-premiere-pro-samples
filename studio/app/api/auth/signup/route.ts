import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByEmail, createSession, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = (await req.json()) as {
      email?: string; password?: string; name?: string;
    };
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    if (getUserByEmail(email)) {
      return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
    }
    const user = createUser(email, password, name);
    setSessionCookie(createSession(user.id));
    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Sign up failed" }, { status: 500 });
  }
}
