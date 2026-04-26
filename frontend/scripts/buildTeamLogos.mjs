// One-off generation script for IPL team logos.
//
// Reads source PNGs from ../Logos/<SHORT>.png, normalizes each to a
// 256×256 transparent-padded PNG, writes them to public/team-logos/, and
// emits a TS module with base64 data URLs so the off-screen ShareCard
// rasterizer can embed them without a runtime fetch (mirrors the JAFFA
// logo bake pattern).
//
// Run from frontend/:  node scripts/buildTeamLogos.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const srcDir = path.join(repoRoot, "Logos");
const publicDir = path.join(repoRoot, "frontend", "public", "team-logos");
const tsOutPath = path.join(repoRoot, "frontend", "src", "app", "punter-card", "[matchId]", "teamLogos.ts");

const TEAMS = ["CSK", "MI", "KKR", "RCB", "RR", "DC", "PBKS", "SRH", "LSG", "GT"];
const SIZE = 256;

fs.mkdirSync(publicDir, { recursive: true });

const dataUrls = {};

for (const team of TEAMS) {
  const src = path.join(srcDir, `${team}.png`);
  if (!fs.existsSync(src)) {
    console.warn(`[skip] missing source: ${src}`);
    continue;
  }
  const lower = team.toLowerCase();
  const dst = path.join(publicDir, `${lower}.png`);

  const buf = await sharp(src)
    .resize(SIZE, SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(dst, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`[ok]   ${team.padEnd(5)} -> ${lower}.png  ${kb}KB`);

  dataUrls[team] = `data:image/png;base64,${buf.toString("base64")}`;
}

const tsLines = [
  "// Auto-generated from frontend/scripts/buildTeamLogos.mjs.",
  "// Inlines each IPL team logo as a base64 data URL so the ShareCard",
  "// rasterizer (html-to-image -> JPEG) embeds the crest without a",
  "// runtime fetch. Mirrors the JAFFA logo pattern.",
  "//",
  "// Re-run `node scripts/buildTeamLogos.mjs` from frontend/ whenever",
  "// the source PNGs in ../Logos/ change.",
  "",
  "export const TEAM_LOGO_DATA_URLS: Record<string, string> = {",
];
for (const [team, url] of Object.entries(dataUrls)) {
  tsLines.push(`  ${team}: "${url}",`);
}
tsLines.push("};");
tsLines.push("");
tsLines.push("export function getTeamLogoDataUrl(short: string | null | undefined): string | null {");
tsLines.push("  if (!short) return null;");
tsLines.push("  return TEAM_LOGO_DATA_URLS[short.toUpperCase()] || null;");
tsLines.push("}");
tsLines.push("");

fs.writeFileSync(tsOutPath, tsLines.join("\n"));
console.log(`\n[ok]   wrote ${tsOutPath} (${(fs.statSync(tsOutPath).size / 1024).toFixed(1)}KB)`);
