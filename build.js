#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const distDir = path.join(__dirname, "dist");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

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
    const dest = path.join(distDir, file);

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
    const cssFiles = findFiles(__dirname, ".css", ["node_modules", ".git", "cesiumjs"]);
    cssFiles.forEach((file) => {
      const src = file;
      const dest = path.join(distDir, path.relative(__dirname, file));
      const content = fs.readFileSync(src, "utf8");
      const minified = minifyCSS(content);
      ensureDirExists(path.dirname(dest));
      fs.writeFileSync(dest, minified);
      console.log(`✓ ${path.relative(__dirname, file)}`);
    });

    // Minify JSON files (GeoJSON, etc.)
    const jsonFiles = findFiles(__dirname, ".json", ["node_modules", ".git", "cesiumjs"]);
    jsonFiles.forEach((file) => {
      const src = file;
      const dest = path.join(distDir, path.relative(__dirname, file));
      // Skip package.json and package-lock.json
      if (file.endsWith("package.json") || file.endsWith("package-lock.json")) {
        return;
      }
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
      const destPath = path.join(distDir, file);

      // Skip node_modules, .git, package files, already-processed files, and dist itself
      if (
        file === "node_modules" ||
        file === ".git" ||
        file === "dist" ||
        file === "package.json" ||
        file === "package-lock.json" ||
        file === "build.js" ||
        jsFiles.includes(file) ||
        file === "style.css" ||
        file.endsWith(".json") ||
        file.startsWith(".")
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

    console.log("\n✓ Build complete. dist/ is ready for deployment.");
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

// Helper: find all files with a given extension, excluding certain dirs
function findFiles(startPath, ext, excludeDirs = []) {
  const results = [];

  function walk(dir) {
    if (excludeDirs.some((e) => dir.includes(e))) return;

    const files = fs.readdirSync(dir);
    files.forEach((file) => {
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
