import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studio — AI content generation",
  description: "Generate images, copy, voiceovers and more. Your own AI creation studio.",
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
