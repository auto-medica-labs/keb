import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const tsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.build-pi-kb.json"), "utf-8"));
const outDir = resolve(root, tsconfig.compilerOptions.outDir);

execSync("tsc -p tsconfig.build-pi-kb.json", {
  cwd: root,
  stdio: "inherit",
});

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/package.json`, '{"type":"module"}\n');

console.log(`Wrote ${outDir}/package.json`);
