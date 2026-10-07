import { ImageResponse } from "next/og";

export const alt = "ShrinkFox — Free image tools. Private by design.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "#f3f1ed", color: "#1a1613", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 32, fontWeight: 700 }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: 52, height: 52, background: "#e8652b", borderRadius: 16, color: "white", fontSize: 32 }}>S</div>
          <span>ShrinkFox</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-3px" }}>Good images. Less effort.</div>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-3px", color: "#c04d18" }}>Zero subscriptions.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 27, color: "#4a423b" }}>Compress · Resize · Convert · Remove backgrounds · Enhance</div>
          <div style={{ display: "flex", gap: 12, fontSize: 22, color: "#1f7a55" }}>Free image tools. Local processing. No sign-up.</div>
        </div>
      </div>
    ),
    size,
  );
}
