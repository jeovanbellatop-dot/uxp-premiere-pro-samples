import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Studio — AI content generation",
  description: "Generate images, copy, voiceovers and more. Your own AI creation studio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
