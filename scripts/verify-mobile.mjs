import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8"),
);
if (manifest.isDesktopOnly !== false) {
  throw new Error("manifest.json must declare isDesktopOnly=false");
}
if (manifest.minAppVersion !== "1.11.4") {
  throw new Error("manifest.json must target the SecretStorage-compatible minimum");
}

const sourceFiles = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(absolute);
    else if (entry.name.endsWith(".ts")) sourceFiles.push(absolute);
  }
}
collect(path.join(root, "src"));

const forbiddenSourceImports = [
  /from\s+["'](?:node:)?fs["']/,
  /from\s+["'](?:node:)?child_process["']/,
  /from\s+["']electron["']/,
  /require\(\s*["']electron["']\s*\)/,
];
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (forbiddenSourceImports.some((pattern) => pattern.test(source))) {
    throw new Error(`desktop-only import found in ${path.relative(root, file)}`);
  }
  if (/\brequestUrl\s*\(/.test(source)) {
    throw new Error(`unsafe requestUrl usage found in ${path.relative(root, file)}`);
  }
}

for (const relative of ["src/fold-state.ts", "src/memory/markdown.ts"]) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  if (/\bfetch\s*\(|MemoryActionGateway|requestUrl\s*\(/.test(source)) {
    throw new Error(`fold/parser code must not perform writes: ${relative}`);
  }
}

const bundle = fs.readFileSync(path.join(root, "main.js"), "utf8");
if (/\brequestUrl\s*\(/.test(bundle)) {
  throw new Error("unsafe requestUrl usage leaked into main.js");
}
for (const forbidden of ['require("fs")', 'require("child_process")', 'require("electron")']) {
  if (bundle.includes(forbidden)) {
    throw new Error(`desktop-only module leaked into main.js: ${forbidden}`);
  }
}

console.log("Mobile static checks passed.");
