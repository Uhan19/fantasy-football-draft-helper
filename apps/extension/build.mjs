import { copyFile, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({
  entryPoints: {
    content: "src/content.ts",
    background: "src/background.ts",
    popup: "src/popup.ts"
  },
  bundle: true,
  format: "iife",
  target: "chrome120",
  outdir: "dist",
  sourcemap: true
});
await Promise.all([
  copyFile("manifest.json", "dist/manifest.json"),
  copyFile("popup.html", "dist/popup.html"),
  copyFile("popup.css", "dist/popup.css")
]);
