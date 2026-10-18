import Link from "next/link";
import { currentUser } from "../lib/auth";

export default function Landing() {
  const user = currentUser();
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="logo">SL</span> Estúdio SL</div>
        <nav style={{ display: "flex", gap: 10 }}>
          {user ? (
            <Link className="ghost" href="/app" style={{ textDecoration: "none" }}>Abrir estúdio →</Link>
          ) : (
            <>
              <Link className="ghost" href="/login" style={{ textDecoration: "none" }}>Entrar</Link>
              <Link className="primary" href="/login?mode=signup" style={{ textDecoration: "none", display: "inline-block" }}>Começar</Link>
            </>
          )}
        </nav>
      </header>

      <section style={{ padding: "48px 0 24px", maxWidth: 640 }}>
        <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: "0 0 16px" }}>
          Seu estúdio de criação com IA.
        </h1>
        <p style={{ fontSize: 18, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 24px" }}>
          Gere imagens, edite fotos, escreva textos e roteiros, analise imagens e
          crie locuções — tudo num só lugar, com a sua marca.
        </p>
        <Link className="primary" href={user ? "/app" : "/login?mode=signup"}
          style={{ textDecoration: "none", display: "inline-block", fontSize: 16 }}>
          {user ? "Abrir o estúdio" : "Começar a criar — créditos grátis"}
        </Link>
      </section>

      <h2 className="section">O que tem dentro</h2>
      <div className="grid">
        {[
          ["Imagem", "Texto → Imagem", "Descreva qualquer coisa e receba uma imagem."],
          ["Imagem", "Editar Imagem", "Envie uma foto e diga o que mudar."],
          ["Marketing", "Foto de Produto", "Produto simples → cena de estúdio."],
          ["Criar", "Melhorar Prompt", "Ideia simples → prompt detalhado."],
          ["Marketing", "Textos & Roteiros", "Títulos, legendas e roteiros."],
          ["Análise", "Analisar Imagem", "Pergunte qualquer coisa sobre uma imagem."],
          ["Áudio", "Locução", "Transforme um texto em voz."],
          ["Vídeo", "Texto / Imagem → Vídeo", "Em breve."],
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
