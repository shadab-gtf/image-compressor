import { writeFileSync } from "node:fs";
import { markSvg } from "./brand-svg.ts";

const out = process.argv[2]!;
const sizes = [16, 24, 32, 48, 64, 128];
const row = (label: string, bg: string, fg: string, variant: "color" | "mono") =>
  `<div class="row" style="background:${bg};color:${fg}">
     <span class="lbl">${label}</span>
     ${sizes.map((s) => `<span class="m" style="width:${s}px;height:${s}px">${markSvg(variant, { id: `${label}${s}` })}</span>`).join("")}
   </div>`;

writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#8a8a8a;font:12px ui-sans-serif,system-ui;display:flex;flex-direction:column}
    .row{display:flex;align-items:flex-end;gap:20px;padding:16px 20px}
    .lbl{width:70px;font-size:11px;opacity:.75;align-self:center}
    .m{display:block}
    .big{display:flex;gap:24px;padding:24px;background:#F7F6F2}
    .big span{width:220px;height:220px;display:block}
    .big .dk{background:#101010;border-radius:16px}
  </style>
  <div class="big">
    <span>${markSvg("color", { id: "big1" })}</span>
    <span class="dk">${markSvg("color", { id: "big2" })}</span>
    <span style="color:#141414">${markSvg("mono", { id: "big3" })}</span>
    <span>${markSvg("icon", { id: "big4" })}</span>
  </div>
  ${row("light", "#F7F6F2", "#141414", "color")}
  ${row("dark", "#101010", "#F5F3EF", "color")}
  ${row("accent", "#E8652B", "#fff", "color")}
  ${row("mono-lt", "#F7F6F2", "#141414", "mono")}
  ${row("mono-dk", "#101010", "#F5F3EF", "mono")}`,
);
