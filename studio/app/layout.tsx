import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estúdio SL — criação com IA",
  description: "Gere imagens, textos, locuções e mais. Seu estúdio de criação com inteligência artificial.",
  // Tell Chrome/Google not to auto-translate: translation mutates the DOM and
  // breaks React hydration (the "client-side exception").
  other: { google: "notranslate" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
