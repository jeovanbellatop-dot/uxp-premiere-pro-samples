// Thin server-side client for Google's Generative Language (Gemini) API.
// Only called from server routes so the key never reaches the browser.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Current model choices (gemini-2.5-* is being retired for new keys). Swap here
// to upgrade — the key also lists nano-banana / gemini-3-pro-image and Lyria.
export const MODELS = {
  text: "gemini-3.8-flash",
  textPro: "gemini-pro-latest",
  image: "gemini-3.1-flash-image",
  tts: "gemini-3.8-flash-tts",
} as const;

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set (put it in .env.local)");
  return k;
}

type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function generateContent(
  model: string,
  parts: Part[],
  generationConfig?: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${BASE}/models/${model}:generateContent?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], ...(generationConfig ? { generationConfig } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${model} failed (${res.status}): ${body.slice(0, 400)}`);
  }
  return res.json();
}

/** Plain text in, plain text out. */
export async function generateText(prompt: string, pro = false): Promise<string> {
  const data = await generateContent(pro ? MODELS.textPro : MODELS.text, [{ text: prompt }]);
  const out = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n");
  if (!out) throw new Error("No text returned");
  return out.trim();
}

/** Text (+ optional reference image) -> generated image as a data URL. */
export async function generateImage(
  prompt: string,
  reference?: { mimeType: string; data: string },
): Promise<string> {
  const parts: Part[] = [];
  if (reference) parts.push({ inlineData: reference });
  parts.push({ text: prompt });
  const data = await generateContent(MODELS.image, parts);
  const img = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!img) {
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join(" ");
    throw new Error(text ? `Model returned text, not an image: ${text.slice(0, 200)}` : "No image returned");
  }
  const { mimeType, data: b64 } = img.inlineData;
  return `data:${mimeType};base64,${b64}`;
}

/** Image + question -> text analysis. */
export async function analyzeImage(image: { mimeType: string; data: string }, question: string): Promise<string> {
  const data = await generateContent(MODELS.text, [{ inlineData: image }, { text: question }]);
  const out = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n");
  if (!out) throw new Error("No analysis returned");
  return out.trim();
}

/** Text -> speech. Returns a WAV data URL (Gemini TTS emits 24kHz mono PCM). */
export async function textToSpeech(text: string, voice = "Kore"): Promise<string> {
  const data = await generateContent(
    MODELS.tts,
    [{ text }],
    {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  );
  const audio = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!audio) throw new Error("No audio returned");
  const pcm = Buffer.from(audio.inlineData.data, "base64");
  const wav = pcmToWav(pcm, 24000, 1);
  return `data:audio/wav;base64,${wav.toString("base64")}`;
}

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const byteRate = sampleRate * channels * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
