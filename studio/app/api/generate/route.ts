import { NextRequest, NextResponse } from "next/server";
import { getTool } from "../../../lib/tools";
import { generateText, generateImage, analyzeImage, textToSpeech, generateVideo } from "../../../lib/gemini";
import { currentUser } from "../../../lib/auth";
import {
  getCredits, spendCredits, saveDataUrl, addAsset,
  createJob, finishJob, failJob,
} from "../../../lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const TEXT_PROMPTS: Record<string, (input: string) => string> = {
  "prompt-enhancer": (i) =>
    `Rewrite this short idea into one vivid, detailed image-generation prompt. ` +
    `Add style, lighting, composition and lens. Output only the prompt.\n\nIdea: ${i}`,
  "ad-copy": (i) =>
    `You are a direct-response copywriter. Given the brief, write: 3 headlines, ` +
    `3 one-line captions, and 1 short CTA. Keep it punchy.\n\nBrief: ${i}`,
  "video-script": (i) =>
    `Write a short vertical video script. Include a 3-second hook, then 4-6 beats ` +
    `with on-screen text and voiceover, then a CTA. Keep it under 45 seconds.\n\nTopic: ${i}`,
};

// Per-tool wrapping for image tools (the user prompt may be empty for edits).
const IMAGE_PROMPTS: Record<string, (p: string) => string> = {
  "product-shot": (p) => `Studio product photography. ${p}. Clean commercial lighting, high detail.`,
  "remove-bg": (p) =>
    `Remove the background completely and cleanly cut out the main subject on a plain white background. Keep the subject sharp. ${p}`,
  "upscale": (p) =>
    `Enhance this image: increase sharpness, fine detail and resolution, reduce noise and artifacts, keep the exact same content and composition. ${p}`,
  "expand": (p) =>
    `Outpaint and extend this image beyond its current borders, continuing the scene and lighting naturally in every direction. ${p}`,
  "restyle": (p) =>
    `Re-render this image in a new visual style: ${p || "a tasteful artistic style"}. Keep the same composition and subject.`,
};

function parseImage(dataUrl?: string): { mimeType: string; data: string } | undefined {
  if (!dataUrl) return undefined;
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  return m ? { mimeType: m[1], data: m[2] } : undefined;
}

export async function POST(req: NextRequest) {
  const user = currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in" }, { status: 401 });

  const { slug, prompt, image, projectId } = (await req.json()) as {
    slug: string; prompt?: string; image?: string; projectId?: string;
  };
  const tool = getTool(slug);
  if (!tool) return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  if (!tool.available) return NextResponse.json({ error: "Tool not available on this key" }, { status: 400 });
  if (tool.needsImage && !image) return NextResponse.json({ error: "This tool needs an image" }, { status: 400 });
  if (!tool.needsImage && !prompt?.trim()) return NextResponse.json({ error: "Enter a prompt" }, { status: 400 });
  if (getCredits(user.id) < tool.cost) return NextResponse.json({ error: "Not enough credits" }, { status: 402 });

  const jobId = createJob(user.id, tool.name, tool.cost);
  try {
    const ref = parseImage(image);
    let output: string;
    let stored: string;

    switch (tool.kind) {
      case "image":
      case "image-edit": {
        const wrap = IMAGE_PROMPTS[slug];
        const p = wrap ? wrap(prompt || "") : (prompt || "");
        const dataUrl = await generateImage(p, tool.kind === "image-edit" ? ref : undefined);
        stored = await saveDataUrl(dataUrl);
        output = stored;
        break;
      }
      case "text": {
        const build = TEXT_PROMPTS[slug] ?? ((i: string) => i);
        output = await generateText(build(prompt!));
        stored = output;
        break;
      }
      case "vision": {
        output = await analyzeImage(ref!, prompt?.trim() || "Describe this image in detail.");
        stored = output;
        break;
      }
      case "audio": {
        const dataUrl = await textToSpeech(prompt!);
        stored = await saveDataUrl(dataUrl);
        output = stored;
        break;
      }
      case "video": {
        const dataUrl = await generateVideo(prompt || "", slug === "image-to-video" ? ref : undefined);
        stored = await saveDataUrl(dataUrl);
        output = stored;
        break;
      }
      default:
        throw new Error("Unsupported tool kind");
    }

    const balance = spendCredits(user.id, tool.cost, "job", jobId);
    const asset = addAsset(user.id, {
      tool: tool.name, kind: tool.kind, prompt: prompt || "(image input)", output: stored,
      projectId: projectId || null,
    });
    finishJob(jobId, asset.id);
    return NextResponse.json({ output, kind: tool.kind, balance, asset });
  } catch (err: any) {
    failJob(jobId, err?.message || "Generation failed");
    return NextResponse.json({ error: err?.message || "Generation failed" }, { status: 500 });
  }
}
