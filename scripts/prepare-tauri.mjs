import fs from "fs";
import path from "path";

const root = process.cwd();
const outDir = path.join(root, "dist-tauri");

// Helper: remove directory
function rm(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// Helper: copy directory
function cp(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) cp(s, d);
    else fs.copyFileSync(s, d);
  }
}

rm(outDir);
fs.mkdirSync(outDir, { recursive: true });

// Next output paths
const standalone = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");

if (!fs.existsSync(standalone)) {
  console.error("Missing .next/standalone. Run `pnpm build` first.");
  process.exit(1);
}
if (!fs.existsSync(staticDir)) {
  console.error("Missing .next/static. Run `pnpm build` first.");
  process.exit(1);
}

// Copy standalone server
cp(standalone, outDir);

// Copy static assets to expected location
const targetStatic = path.join(outDir, ".next", "static");
cp(staticDir, targetStatic);

// Copy public (optional, but safe)
if (fs.existsSync(publicDir)) {
  cp(publicDir, path.join(outDir, "public"));
}

console.log("Prepared dist-tauri/");
