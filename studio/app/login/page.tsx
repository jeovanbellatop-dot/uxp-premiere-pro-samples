"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="wrap" style={{ maxWidth: 420 }} />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(undefined);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push("/app");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 420 }}>
      <header className="top">
        <Link href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="logo" /> Studio
        </Link>
      </header>

      <div className="runner">
        <div className="head"><h3>{mode === "login" ? "Log in" : "Create your account"}</h3></div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <input type="text" placeholder="Name (optional)" value={name}
              onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />
          )}
          <input type="text" placeholder="Email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />
          <input type="password" placeholder="Password (min 8 chars)" value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)} />
          <div className="row">
            <button className="primary" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> &nbsp;…</> : mode === "login" ? "Log in" : "Sign up"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 16 }}>
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <a style={{ color: "var(--accent)", cursor: "pointer" }}
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(undefined); }}>
            {mode === "login" ? "Sign up" : "Log in"}
          </a>
        </p>
      </div>
    </div>
  );
}
