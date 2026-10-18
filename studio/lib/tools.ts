// The tool catalogue — the "same tools" surface, mapped to what the Gemini key
// can actually do. `kind` decides which output the UI shows; `available: false`
// tools render as "coming soon" (they need an engine the key doesn't have yet).

export type ToolKind = "image" | "image-edit" | "text" | "vision" | "audio" | "video";

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
  // Imagem
  { slug: "text-to-image", name: "Texto → Imagem", area: "Imagem", kind: "image", cost: 5,
    description: "Descreva qualquer coisa e receba uma imagem.", available: true,
    placeholder: "Um mercado de rua à noite com luzes de neon, cinematográfico, 35mm" },
  { slug: "image-edit", name: "Editar Imagem", area: "Imagem", kind: "image-edit", cost: 5,
    description: "Envie uma imagem e diga o que mudar.", needsImage: true, available: true,
    placeholder: "Troque o fundo por uma montanha com neve, mantendo o personagem" },
  { slug: "product-shot", name: "Foto de Produto", area: "Marketing", kind: "image", cost: 6,
    description: "Transforme um produto simples numa cena de estúdio.", available: true,
    placeholder: "Um frasco de perfume sobre pedra molhada, luz suave da manhã, anúncio de luxo" },

  // Texto
  { slug: "prompt-enhancer", name: "Melhorar Prompt", area: "Criar", kind: "text", cost: 1,
    description: "Transforme uma ideia simples num prompt detalhado.", available: true,
    placeholder: "um gato astronauta" },
  { slug: "ad-copy", name: "Textos de Anúncio", area: "Marketing", kind: "text", cost: 1,
    description: "Títulos e legendas para sua campanha.", available: true,
    placeholder: "Produto: um copo reutilizável. Público: quem trabalha de casa." },
  { slug: "video-script", name: "Roteiro de Vídeo", area: "Marketing", kind: "text", cost: 1,
    description: "Um gancho + roteiro passo a passo para um vídeo curto.", available: true,
    placeholder: "Um reels de 30s promovendo um app de finanças para estudantes" },

  // Visão
  { slug: "image-analyzer", name: "Analisar Imagem", area: "Análise", kind: "vision", cost: 1,
    description: "Envie uma imagem e pergunte qualquer coisa sobre ela.", needsImage: true, available: true,
    placeholder: "O que deixaria esta foto de produto mais atraente?" },

  // Áudio
  { slug: "voiceover", name: "Locução (voz)", area: "Áudio", kind: "audio", cost: 2,
    description: "Transforme um texto em voz falada.", available: true,
    placeholder: "Bem-vindo ao futuro da criação." },

  // Vídeo (Veo 3.1)
  { slug: "text-to-video", name: "Texto → Vídeo", area: "Vídeo", kind: "video", cost: 20,
    description: "Gere um clipe de vídeo a partir de um texto.", available: true,
    placeholder: "Um café fumegante numa mesa de madeira, câmera aproximando devagar" },
  { slug: "image-to-video", name: "Imagem → Vídeo", area: "Vídeo", kind: "video", cost: 20,
    description: "Anime uma imagem parada com um movimento.", needsImage: true, available: true,
    placeholder: "Faça o personagem acenar e o fundo se mover suavemente" },
];

export function getTool(slug: string): Tool | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
