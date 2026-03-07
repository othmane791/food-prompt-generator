import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Food Prompt Generator",
  description: "Generate image prompts and captions for recipe/article posts."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
