import type { Metadata } from "next";
import "./globals.css";
import { Rail } from "@/components/Rail";

export const metadata: Metadata = {
  title: "CaseCoach — timed case interview practice",
  description: "AI-generated PE / consulting case practice with bespoke feedback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">
          <Rail />
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
