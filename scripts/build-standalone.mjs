import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, "dist");
const outputRoot = path.join(projectRoot, "standalone");
const outputFile = path.join(outputRoot, "直接打开-异世界连接.html");

const html = await readFile(path.join(distRoot, "index.html"), "utf8");
const scriptMatch = html.match(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
);
const styleMatch = html.match(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/,
);

if (!scriptMatch || !styleMatch) {
  throw new Error("没有在 dist/index.html 中找到可内联的脚本或样式");
}

function assetPath(reference) {
  const relativeReference = reference
    .replace(/^\.?\//, "")
    .replace(/^Benny\//, "");
  return path.join(distRoot, relativeReference);
}

const [javascript, stylesheet] = await Promise.all([
  readFile(assetPath(scriptMatch[1]), "utf8"),
  readFile(assetPath(styleMatch[1]), "utf8"),
]);

if (/\bimport\s|import\.meta/.test(javascript)) {
  throw new Error("构建产物仍包含模块导入，不能安全生成直接打开版");
}

const standalone = html
  .replace(
    styleMatch[0],
    () => `<style>${stylesheet.replace(/<\/style/gi, "<\\/style")}</style>`,
  )
  .replace(scriptMatch[0], "")
  .replace(
    "</body>",
    () =>
      `<script>${javascript.replace(/<\/script/gi, "<\\/script")}</script>\n  </body>`,
  );

await mkdir(outputRoot, { recursive: true });
await writeFile(outputFile, standalone, "utf8");

console.log(`已生成 ${outputFile}`);
