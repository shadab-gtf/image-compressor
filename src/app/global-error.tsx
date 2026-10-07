"use client";

import type { RouteErrorProps } from "@/components/ui/error-state";

export default function GlobalError({ retry }: RouteErrorProps) {
  return (
    <html lang="en">
      <head><title>Unable to load | ShrinkFox</title><meta name="robots" content="noindex" /></head>
      <body style={{ margin: 0, background: "#f3f1ed", color: "#1a1613", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px", boxSizing: "border-box" }}>
          <div style={{ maxWidth: "440px", textAlign: "center" }}>
            <p style={{ fontWeight: 700, color: "#c04d18" }}>ShrinkFox</p>
            <h1 style={{ fontSize: "32px", lineHeight: 1.15 }}>We couldn’t open the app</h1>
            <p style={{ lineHeight: 1.7, color: "#4a423b" }}>Please try again. Your original images on your device are unchanged.</p>
            <button onClick={retry} type="button" style={{ border: 0, borderRadius: "999px", background: "#c04d18", color: "#fff", padding: "14px 24px", fontSize: "16px", fontWeight: 600, cursor: "pointer" }}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
