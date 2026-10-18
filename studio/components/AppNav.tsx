"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AppNav({ credits }: { credits: number }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <header className="top">
      <Link href="/app" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
        <span className="logo">SL</span> Estúdio SL
      </Link>
      <nav style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div className="credits"><span>Créditos</span> <b>{credits}</b></div>
        <Link className="ghost" href="/billing" style={{ textDecoration: "none" }}>Comprar créditos</Link>
        <Link className="ghost" href="/settings" style={{ textDecoration: "none" }}>Configurações</Link>
        <button className="ghost" onClick={logout}>Sair</button>
      </nav>
    </header>
  );
}
