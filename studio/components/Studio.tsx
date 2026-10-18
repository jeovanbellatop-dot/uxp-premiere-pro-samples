"use client";

import { useState, useRef } from "react";
import { TOOLS, type Tool } from "../lib/tools";
import AppNav from "./AppNav";

interface User { id: string; email: string; name: string | null; credits: number; }
interface Asset { id: string; tool: string; kind: string; prompt: string; output: string; project_id: string | null; }
interface Project { id: string; name: string; }

export default function Studio({
  user, initialAssets, initialProjects,
}: { user: User; initialAssets: Asset[]; initialProjects: Project[] }) {
  const [credits, setCredits] = useState(user.credits);
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [active, setActive] = useState<Tool | null>(null);
  const [filter, setFilter] = useState<string>("all"); // project id or "all"

  async function createProject() {
    const name = prompt("Nome do projeto");
    if (!name) return;
    const res = await fetch("/api/projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.project) setProjects([data.project, ...projects]);
  }

  const shown = filter === "all" ? assets : assets.filter((a) => a.project_id === filter);

  return (
    <div className="wrap">
      <AppNav credits={credits} />

      {active ? (
        <Runner
          tool={active}
          projects={projects}
          onClose={() => setActive(null)}
          onDone={(balance, asset) => { setCredits(balance); setAssets([asset, ...assets]); }}
        />
      ) : (
        <>
          <h2 className="section">Ferramentas</h2>
          <div className="grid">
            {TOOLS.map((t) => (
              <div key={t.slug} className={`card ${t.available ? "" : "disabled"}`}
                onClick={() => t.available && setActive(t)}>
                {t.available ? <span className="cost">{t.cost}c</span> : <span className="soon">em breve</span>}
                <div className="area">{t.area}</div>
                <h3>{t.name}</h3>
                <p>{t.description}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="section">Biblioteca</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
            <option value="all">Todos os projetos</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="ghost" onClick={createProject}>+ Projeto</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty">Nada aqui ainda. Escolha uma ferramenta e crie algo.</p>
      ) : (
        <div className="gallery">
          {shown.map((g) => (
            <div key={g.id} className="gitem">
              {g.kind === "image" || g.kind === "image-edit" ? (
                <img src={g.output} alt={g.prompt} />
              ) : g.kind === "video" ? (
                <video src={g.output} controls style={{ width: "100%", display: "block" }} />
              ) : g.kind === "audio" ? (
                <div className="txt"><audio controls src={g.output} style={{ width: "100%" }} /></div>
              ) : (
                <div className="txt">{g.output}</div>
              )}
              <div className="meta">{g.tool}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Runner({
  tool, projects, onClose, onDone,
}: {
  tool: Tool; projects: Project[];
  onClose: () => void; onDone: (balance: number, asset: Asset) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [projectId, setProjectId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ output: string; kind: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function run() {
    if (tool.kind === "video") {
      const ok = window.confirm(
        "Gerar vídeo consome bem mais da sua cota paga do Google do que imagem ou texto. " +
        "Cada clipe tem custo real na sua conta. Deseja continuar?",
      );
      if (!ok) return;
    }
    setLoading(true); setError(undefined); setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: tool.slug, prompt, image, projectId: projectId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falhou");
      setResult({ output: data.output, kind: data.kind });
      onDone(data.balance, data.asset);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const isImage = result?.kind === "image" || result?.kind === "image-edit";

  return (
    <div className="runner">
      <div className="head">
        <h3>{tool.name}</h3>
        <button className="back" onClick={onClose}>← Todas as ferramentas</button>
      </div>

      {tool.needsImage && (
        <>
          <div className="drop" onClick={() => fileRef.current?.click()}>
            {image ? "Trocar imagem" : "Clique para enviar uma imagem"}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
          {image && <img className="preview-img" src={image} alt="input" />}
        </>
      )}

      <div style={{ marginTop: tool.needsImage ? 12 : 0 }}>
        <textarea placeholder={tool.placeholder || "Escreva um prompt…"} value={prompt}
          onChange={(e) => setPrompt(e.target.value)} />
      </div>

      <div className="row">
        <button className="primary" onClick={run} disabled={loading}>
          {loading ? <><span className="spinner" /> &nbsp;Gerando…</> : `Gerar · ${tool.cost} cr`}
        </button>
        {projects.length > 0 && (
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
            style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 10px" }}>
            <option value="">Sem projeto</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {tool.kind === "video" && loading && (
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>
          O vídeo pode levar de 1 a 3 minutos. Deixe esta aba aberta…
        </p>
      )}

      {error && <div className="error">{error}</div>}

      {result && (
        <div className="result">
          {isImage ? (
            <><img src={result.output} alt="resultado" /><br /><a className="dl" href={result.output} download>Baixar</a></>
          ) : result.kind === "video" ? (
            <><video src={result.output} controls autoPlay loop style={{ width: "100%", borderRadius: 10, border: "1px solid var(--border)" }} /><br /><a className="dl" href={result.output} download>Baixar</a></>
          ) : result.kind === "audio" ? (
            <><audio controls src={result.output} style={{ width: "100%" }} /><br /><a className="dl" href={result.output} download>Baixar</a></>
          ) : (
            <pre>{result.output}</pre>
          )}
        </div>
      )}
    </div>
  );
}
