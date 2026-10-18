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
      if (!res.ok) throw new Error(data.error || "Falhou");
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
          <span className="logo">SL</span> Estúdio SL
        </Link>
      </header>

      <div className="runner">
        <div className="head"><h3>{mode === "login" ? "Entrar" : "Criar sua conta"}</h3></div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <input type="text" placeholder="Nome (opcional)" value={name}
              onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />
          )}
          <input type="text" placeholder="E-mail" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />
          <input type="password" placeholder="Senha (mín. 8 caracteres)" value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)} />
          <div className="row">
            <button className="primary" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> &nbsp;…</> : mode === "login" ? "Entrar" : "Cadastrar"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 16 }}>
          {mode === "login" ? "Ainda não tem conta? " : "Já tem uma conta? "}
          <a style={{ color: "var(--accent)", cursor: "pointer" }}
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(undefined); }}>
            {mode === "login" ? "Cadastre-se" : "Entrar"}
          </a>
        </p>
      </div>
    </div>
  );
}
