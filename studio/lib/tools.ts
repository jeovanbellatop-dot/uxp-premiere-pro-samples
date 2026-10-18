// The tool catalogue — the "same tools" surface, mapped to what the Gemini key
// can actually do. `kind` decides which output the UI shows; `available: false`
// tools render as "coming soon" (they need an engine the key doesn't have yet).

export type ToolKind = "image" | "image-edit" | "text" | "vision" | "audio";

export interface Tool {
  slug: string;
  name: string;
  area: string;
  kind: ToolKind;
  description: string;
  cost: number; // credits per run
  needsImage?: boolean; // requires an uploaded image
  available: boolean;
  placeholder?: string; // prompt-box hint
}

export const TOOLS: Tool[] = [
  // Image
  { slug: "text-to-image", name: "Text → Image", area: "Image", kind: "image", cost: 5,
    description: "Describe anything and get an image.", available: true,
    placeholder: "A neon-lit street market at night, cinematic, 35mm" },
  { slug: "image-edit", name: "Edit Image", area: "Image", kind: "image-edit", cost: 5,
    description: "Upload an image and tell it what to change.", needsImage: true, available: true,
    placeholder: "Replace the background with a snowy mountain, keep the subject" },
  { slug: "product-shot", name: "Product Shot", area: "Marketing", kind: "image", cost: 6,
    description: "Turn a plain product into a styled studio scene.", available: true,
    placeholder: "A perfume bottle on wet stone, soft morning light, luxury ad" },

  // Text
  { slug: "prompt-enhancer", name: "Prompt Enhancer", area: "Create", kind: "text", cost: 1,
    description: "Turn a rough idea into a rich generation prompt.", available: true,
    placeholder: "a cat astronaut" },
  { slug: "ad-copy", name: "Ad Copy", area: "Marketing", kind: "text", cost: 1,
    description: "Headlines and captions for your campaign.", available: true,
    placeholder: "Product: a reusable coffee cup. Audience: commuters." },
  { slug: "video-script", name: "Short Video Script", area: "Marketing", kind: "text", cost: 1,
    description: "A hook + beat-by-beat script for a short video.", available: true,
    placeholder: "A 30s reel promoting a budgeting app for students" },

  // Vision
  { slug: "image-analyzer", name: "Analyze Image", area: "Insights", kind: "vision", cost: 1,
    description: "Upload an image and ask anything about it.", needsImage: true, available: true,
    placeholder: "What could make this product photo more appealing?" },

  // Audio
  { slug: "voiceover", name: "Voiceover (TTS)", area: "Audio", kind: "audio", cost: 2,
    description: "Turn a script into a spoken voiceover.", available: true,
    placeholder: "Welcome to the future of creation." },

  // Not yet available on this key
  { slug: "text-to-video", name: "Text → Video", area: "Video", kind: "image", cost: 20,
    description: "Generate a video clip. Needs a Veo-enabled key.", available: false },
  { slug: "image-to-video", name: "Image → Video", area: "Video", kind: "image", cost: 20,
    description: "Animate a still image. Needs a Veo-enabled key.", available: false },
];

export function getTool(slug: string): Tool | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
