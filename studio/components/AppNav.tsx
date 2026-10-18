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
        <span className="logo" /> Studio
      </Link>
      <nav style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div className="credits"><span>Credits</span> <b>{credits}</b></div>
        <Link className="ghost" href="/billing" style={{ textDecoration: "none" }}>Buy credits</Link>
        <Link className="ghost" href="/settings" style={{ textDecoration: "none" }}>Settings</Link>
        <button className="ghost" onClick={logout}>Log out</button>
      </nav>
    </header>
  );
}
