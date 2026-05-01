/**
 * Builds all bundle icons from resources/app-icon.png:
 * composes a 1024×1024 master (full bleed, cover), clips to a macOS-like squircle,
 * then runs `tauri icon`.
 *
 * Override source: AGENTURE_ICON_SRC=path/to.png (relative to repo root).
 *
 * Requires resources/app-icon.png — add it manually or copy once:
 *   cp public/agenture.png resources/app-icon.png
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SIZE = 1024;
const RADIUS = Math.round(SIZE * 0.2237);

const masterFile = join(root, "resources/app-icon.png");
const staged = join(root, "src-tauri/icon-source-1024.png");

const input = process.env.AGENTURE_ICON_SRC
  ? join(root, process.env.AGENTURE_ICON_SRC)
  : masterFile;

if (!existsSync(input)) {
  console.error(
    "Missing icon source. Expected resources/app-icon.png\n" +
      "  Example: cp public/agenture.png resources/app-icon.png\n" +
      "Or set AGENTURE_ICON_SRC=my-icon.png",
  );
  process.exit(1);
}
console.log("Building from:", input);

async function composeMaster() {
  const filled = await sharp(input)
    .resize(SIZE, SIZE, {
      fit: "cover",
      position: "centre",
    })
    .ensureAlpha()
    .png()
    .toBuffer();

  const squircleSvg = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="white"/>
    </svg>`,
  );

  await sharp(filled)
    .composite([{ input: squircleSvg, blend: "dest-in" }])
    .png()
    .toFile(staged);
}

await composeMaster();
console.log("Wrote", staged);

const tauri = spawnSync(
  "pnpm",
  ["exec", "tauri", "icon", staged, "--output", join(root, "src-tauri/icons")],
  { cwd: root, stdio: "inherit" },
);
if (tauri.status !== 0) {
  process.exit(tauri.status ?? 1);
}

const icon512 = join(root, "src-tauri/icons/icon.png");
const spawnCp = spawnSync("cp", [icon512, join(root, "public/agenture.png")], {
  stdio: "inherit",
});
if (spawnCp.status !== 0) {
  process.exit(spawnCp.status ?? 1);
}
console.log("Synced public/agenture.png from regenerated icon.png");
