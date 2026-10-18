import { NextRequest, NextResponse } from "next/server";
import { promises as fsp } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");

const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", wav: "audio/wav", mp3: "audio/mpeg",
  mp4: "video/mp4", webm: "video/webm",
};

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  const name = params.name;
  // Only allow plain filenames (uuid.ext) — no path traversal.
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(name)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const buf = await fsp.readFile(path.join(MEDIA_DIR, name));
    const ext = name.split(".").pop()!.toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": TYPES[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
