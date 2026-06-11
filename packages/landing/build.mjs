import { minify as minifyHtml } from "html-minifier-terser";
import postcss from "postcss";
import cssnano from "cssnano";
import sharp from "sharp";
import { rm, cp, readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";

// --- cleanup ---
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST);
await mkdir(`${DIST}/asset`);

// --- inject partials + minify HTML ---
console.log("Building HTML...");
const nav = await readFile("_nav.html", "utf-8");
const footer = await readFile("_footer.html", "utf-8");

for (const page of ["index.html", "privacy.html", "how-to-use.html"]) {
  let html = await readFile(page, "utf-8");
  html = html.replace("<!-- NAV -->", nav);
  html = html.replace("<!-- FOOTER -->", footer);
  const minifiedHtml = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    minifyCSS: false,
    minifyJS: true,
    keepClosingSlash: true,
  });
  await writeFile(`${DIST}/${page}`, minifiedHtml);
}

// --- copy asset files ---
await cp("theme.js", `${DIST}/theme.js`);
console.log("Minifying CSS...");
const css = await readFile("style.css", "utf-8");
const result = await postcss([cssnano({ preset: "default" })]).process(css, {
  from: "style.css",
  to: `${DIST}/style.css`,
});
await writeFile(`${DIST}/style.css`, result.css);

// --- compress images ---
console.log("Compressing images...");
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
const assetFiles = (await readdir("asset")).map((f) => join("asset", f));

for (const file of assetFiles) {
  const ext = file.slice(file.lastIndexOf("."));
  if (!IMAGE_EXTENSIONS.includes(ext)) continue;

  const outPath = `${DIST}/${file}`;
  console.log(`  Compressing ${file}...`);

  const pipeline = sharp(file);

  if (ext === ".png") {
    await pipeline.png({ effort: 10 }).toFile(outPath);
  } else if (ext === ".jpg" || ext === ".jpeg") {
    await pipeline.jpeg({ quality: 80, progressive: true }).toFile(outPath);
  } else if (ext === ".webp") {
    await pipeline.webp({ quality: 80 }).toFile(outPath);
  } else {
    await cp(file, outPath);
  }
}

console.log(`\nDone! Build output: ${DIST}/`);

// --- summary ---
async function size(path) {
  const s = await stat(path);
  return (s.size / 1024).toFixed(1) + " KB";
}

const PAGE_FILES = ["index.html", "privacy.html", "how-to-use.html"];
for (const page of PAGE_FILES) {
  console.log(`  ${page.padEnd(18)} ${await size(`${DIST}/${page}`)}`);
}
console.log(`  style.css  : ${await size(`${DIST}/style.css`)}`);
for (const file of assetFiles) {
  const ext = file.slice(file.lastIndexOf("."));
  if (!IMAGE_EXTENSIONS.includes(ext)) continue;
  console.log(`  ${file.padEnd(25)} ${await size(`${DIST}/${file}`)}`);
}
