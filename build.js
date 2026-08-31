#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const docsDir = path.join(__dirname, "docs");

// ---------------------------------------------------------------------------
// What never ships to docs/. One list, consulted by every pass below (JS, CSS,
// JSON, the asset copy, and the recursive directory copy) so a file can't slip
// in through one pass while another correctly skips it — which is exactly how
// .claude/settings.local.json ended up deployed.
// ---------------------------------------------------------------------------
const EXCLUDED_NAMES = new Set([
  "node_modules",
  "docs",
  "dist",
  "build.js",
  "package.json",
  "package-lock.json",
  "__pycache__",     // Python bytecode from devserver.py
  "devserver.py",    // local dev server, not part of the deployed site
  // Local Cesium 1.138 download (11MB). index.html loads 1.121 from the Cesium
  // CDN, so nothing here is ever requested. Stays in the repo; just not shipped.
  "cesiumjs",
  // Unreferenced at runtime: vehicle icons are canvas-drawn PNG data URIs
  // (see vehicles.js). These are only named in a historical comment there.
  "a318.glb",
  "CesiumMilkTruck.glb",
  "CesiumMilkTruck.gltf",
  // Route source data. The app only fetches data/states-ny-nj-pa.geojson;
  // these are inputs used to author itinerary.js, not runtime assets.
  "kuwait.geojson",
  "usa.geojson",
  "kuwait-to-usa.geojson",
  "path.json",
  "fullpath.json",
  "usapath.json",
]);

function isExcluded(name) {
  // Dotfiles and dot-directories (.claude, .git, .vscode) are local tooling.
  if (name.startsWith(".")) return true;
  // Windows NTFS alternate-data-stream markers created when files are
  // downloaded from the internet. Pure noise; ~300 of them had accumulated.
  if (name.endsWith(":Zone.Identifier")) return true;
  // Internal docs and notes (claude.md, BLOG-NOTES.md, README.md). GitHub
  // Pages serves index.html anyway, so none of these are reachable content.
  if (name.toLowerCase().endsWith(".md")) return true;
  return EXCLUDED_NAMES.has(name);
}

// Start from an empty docs/ every build. Without this the output is additive:
// files renamed or deleted in the source stay in docs/ forever, and stale
// copies get deployed alongside the current ones.
if (fs.existsSync(docsDir)) {
  fs.rmSync(docsDir, { recursive: true, force: true });
}
fs.mkdirSync(docsDir, { recursive: true });

// List of JS files to minify
const jsFiles = ["app.js", "config.js", "flags.js", "itinerary.js", "vehicles.js"];

// Helper: minify CSS by removing comments and unnecessary whitespace
function minifyCSS(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove /* */ comments
    .replace(/\n\s*\n/g, "\n") // Remove empty lines
    .replace(/\s+/g, " ") // Collapse whitespace
    .replace(/\s*([{}:;,>+~])\s*/g, "$1") // Remove spaces around CSS syntax
    .trim();
}

// Helper: minify JSON by parsing and re-stringifying
function minifyJSON(content) {
  try {
    return JSON.stringify(JSON.parse(content));
  } catch (e) {
    console.warn(`Warning: could not minify JSON, using original`);
    return content;
  }
}

// Minify each JS file
Promise.all(
  jsFiles.map((file) => {
    const src = path.join(__dirname, file);
    const dest = path.join(docsDir, file);

    return esbuild
      .build({
        entryPoints: [src],
        outfile: dest,
        minify: true,
        bundle: false,
        target: "es2020",
      })
      .then(() => console.log(`✓ ${file}`))
      .catch((err) => {
        console.error(`✗ ${file}:`, err.message);
        process.exit(1);
      });
  })
)
  .then(() => {
    // Minify CSS files
    const cssFiles = findFiles(__dirname, ".css");
    cssFiles.forEach((file) => {
      const src = file;
      const dest = path.join(docsDir, path.relative(__dirname, file));
      const content = fs.readFileSync(src, "utf8");
      const minified = minifyCSS(content);
      ensureDirExists(path.dirname(dest));
      fs.writeFileSync(dest, minified);
      console.log(`✓ ${path.relative(__dirname, file)}`);
    });

    // Minify JSON files (GeoJSON, etc.)
    const jsonFiles = findFiles(__dirname, ".json");
    jsonFiles.forEach((file) => {
      const src = file;
      const dest = path.join(docsDir, path.relative(__dirname, file));
      const content = fs.readFileSync(src, "utf8");
      const minified = minifyJSON(content);
      ensureDirExists(path.dirname(dest));
      fs.writeFileSync(dest, minified);
      console.log(`✓ ${path.relative(__dirname, file)}`);
    });

    // Copy other assets (HTML, images, data files, folders)
    const srcDir = __dirname;
    const files = fs.readdirSync(srcDir);

    files.forEach((file) => {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(docsDir, file);

      // Skip everything non-deployable, plus files the passes above already
      // emitted in minified form (JS, style.css, JSON).
      if (
        isExcluded(file) ||
        jsFiles.includes(file) ||
        file === "style.css" ||
        file.endsWith(".json")
      ) {
        return;
      }

      const stat = fs.statSync(srcPath);
      if (stat.isDirectory()) {
        // Copy entire directory
        copyDir(srcPath, destPath);
      } else {
        // Copy file
        fs.copyFileSync(srcPath, destPath);
      }
    });

    console.log("\n✓ Build complete. docs/ is ready for deployment.");
  })
  .catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });

// Helper: recursively copy a directory
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  fs.readdirSync(src).forEach((file) => {
    if (isExcluded(file)) return;

    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    const stat = fs.statSync(srcFile);

    if (stat.isDirectory()) {
      copyDir(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  });
}

// Helper: ensure directory exists
function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Helper: find all files with a given extension, skipping anything excluded
function findFiles(startPath, ext) {
  const results = [];

  function walk(dir) {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      // Same exclusion list the copy passes use. This pass previously tested
      // `dir.includes(name)` against the full path, which (a) missed dot-dirs
      // entirely — that's how .claude/settings.local.json got deployed — and
      // (b) would exclude the whole project if it happened to live under a
      // folder named "docs".
      if (isExcluded(file)) return;

      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walk(filePath);
      } else if (file.endsWith(ext)) {
        results.push(filePath);
      }
    });
  }

  walk(startPath);
  return results;
}
