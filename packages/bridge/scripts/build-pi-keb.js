import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const tsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.build-pi-keb.json"), "utf-8"));
const outDir = resolve(root, tsconfig.compilerOptions.outDir);

execSync("tsc -p tsconfig.build-pi-keb.json", {
  cwd: root,
  stdio: "inherit",
});

// Post-process: add .js extensions to bare relative imports so Node ESM can resolve them.
// moduleResolution: "Bundler" leaves them extensionless, but Node needs the extension.
function addJsExtensions(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      addJsExtensions(full);
    } else if (entry.name.endsWith(".js")) {
      let content = readFileSync(full, "utf-8");
      const original = content;
      content = content.replace(/(?<=from\s+['"])\.\.?(?:\/[^'"]+)+(?=['"])/g, (m) =>
        extname(m) ? m : m + ".js",
      );
      if (content !== original) {
        writeFileSync(full, content, "utf-8");
      }
    }
  }
}
addJsExtensions(outDir);

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/package.json`, '{"type":"module"}\n');

console.log(`Wrote ${outDir}/package.json`);
