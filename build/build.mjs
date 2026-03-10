import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");
const PACK_SRC = path.join(ROOT, "src", "packs");
const PACK_DIST = path.join(DIST_DIR, "packs");

function clean() {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return;

  ensureDir(destination);

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function renderManifest() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const template = fs.readFileSync(path.join(ROOT, "src", "static", "module.json"), "utf8");
  const rendered = template
    .replaceAll("<%= id %>", packageJson.name)
    .replaceAll("<%= version %>", packageJson.version);

  try {
    return JSON.parse(rendered);
  } catch (error) {
    console.error("Invalid module manifest template.");
    throw error;
  }
}

function compileTypescript() {
  const tscPath = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [tscPath, "-p", "tsconfig.json"], {
    cwd: ROOT,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function buildPacks(manifest) {
  ensureDir(PACK_DIST);

  const declaredPacks = Array.isArray(manifest.packs) ? manifest.packs : [];

  for (const pack of declaredPacks) {
    const folder = `${pack.name}.db`;
    const folderPath = path.join(PACK_SRC, folder);
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Missing source pack folder: src/packs/${folder}`);
    }

    const documents = fs
      .readdirSync(folderPath)
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(folderPath, file))
      .map((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")))
      .sort((left, right) => String(left._id ?? "").localeCompare(String(right._id ?? "")));

    if (documents.length === 0) {
      throw new Error(`Source pack folder is empty: src/packs/${folder}`);
    }

    const dbContents =
      documents.length > 0 ? `${documents.map((document) => JSON.stringify(document)).join("\n")}\n` : "";

    fs.writeFileSync(path.join(PACK_DIST, folder), dbContents, "utf8");
  }
}

function buildManifest(manifest) {
  fs.writeFileSync(path.join(DIST_DIR, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function main() {
  if (process.argv.includes("--clean")) {
    clean();
    return;
  }

  clean();
  compileTypescript();
  const manifest = renderManifest();
  copyDirectory(path.join(ROOT, "src", "assets"), path.join(DIST_DIR, "assets"));
  copyDirectory(path.join(ROOT, "src", "lang"), path.join(DIST_DIR, "lang"));
  copyDirectory(path.join(ROOT, "src", "styles"), path.join(DIST_DIR, "styles"));
  buildPacks(manifest);
  buildManifest(manifest);
}

main();
