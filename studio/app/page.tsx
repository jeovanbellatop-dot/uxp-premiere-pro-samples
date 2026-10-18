import Link from "next/link";
import { currentUser } from "@/lib/auth";

export default function Landing() {
  const user = currentUser();
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="logo" /> Studio</div>
        <nav style={{ display: "flex", gap: 10 }}>
          {user ? (
            <Link className="ghost" href="/app" style={{ textDecoration: "none" }}>Open studio →</Link>
          ) : (
            <>
              <Link className="ghost" href="/login" style={{ textDecoration: "none" }}>Log in</Link>
              <Link className="primary" href="/login?mode=signup" style={{ textDecoration: "none", display: "inline-block" }}>Get started</Link>
            </>
          )}
        </nav>
      </header>

      <section style={{ padding: "48px 0 24px", maxWidth: 640 }}>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: "0 0 16px" }}>
          Your own AI content studio.
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 24px" }}>
          Generate images, edit photos, write copy and scripts, analyze visuals and
          create voiceovers — in one place, with your own brand and your own key.
        </p>
        <Link className="primary" href={user ? "/app" : "/login?mode=signup"}
          style={{ textDecoration: "none", display: "inline-block", fontSize: 16 }}>
          {user ? "Open the studio" : "Start creating — free credits"}
        </Link>
      </section>

      <h2 className="section">What's inside</h2>
      <div className="grid">
        {[
          ["Image", "Text → Image", "Describe anything, get a picture."],
          ["Image", "Edit Image", "Upload and change what you want."],
          ["Marketing", "Product Shot", "Plain product → studio scene."],
          ["Create", "Prompt Enhancer", "Rough idea → rich prompt."],
          ["Marketing", "Ad Copy & Scripts", "Headlines, captions, reels."],
          ["Insights", "Analyze Image", "Ask anything about a visual."],
          ["Audio", "Voiceover", "Turn a script into speech."],
          ["Video", "Text / Image → Video", "Coming soon."],
        ].map(([area, name, desc]) => (
          <div className="card" key={name} style={{ cursor: "default" }}>
            <div className="area">{area}</div>
            <h3>{name}</h3>
            <p>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
