import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { docsDirectory, root } from "./context.js";

// Execute the README listings themselves, adding their shared Quick Start context.
const readme = await readFile(new URL("README.md", root), "utf8");
const snippets: { source: string; name: string }[] = [];
let pending: string[] = [];
for (const match of readme.matchAll(/```tsx?\n([\s\S]*?)```|!\[Typeset result\]\(docs\/assets\/([\w-]+)\.png\)/g)) {
  if (match[1] !== undefined) pending.push(match[1]);
  else if (match[2]) {
    if (!pending.length) throw new Error("Result image has no preceding TypeScript listing");
    for (const source of pending) snippets.push({ source, name: match[2] });
    pending = [];
  }
}
if (pending.length) throw new Error("TypeScript listings are missing a result image");
const rendered = new Map<string, Buffer>();
const generated = new URL(".generated/readme/", docsDirectory);
await mkdir(generated, { recursive: true });
await writeFile(new URL("dictionary.csv", generated), await readFile(new URL("assets/dictionary.csv", docsDirectory)));
for (const { source, name } of snippets) {
  if (!source || !name) throw new Error("Missing README example source or image name");
  // Save a compact preview instead of the Quick Start's full-page output.pdf.
  const code = source.replace(/^import .*;\n/gm, "")
    .replace('userDictionaryPath: "./dictionary.csv"', `userDictionaryPath: ${JSON.stringify(fileURLToPath(new URL("dictionary.csv", generated)))}`)
    .replace(/^await (?:minitype|minitypeJSX)\(.*\.save\("output.pdf"\);\n?/gm, "");
  const moduleSource = `import { minitype, p, ruby, table } from "@minitype/minitype";
import { createRubinate, autoRuby } from "minitype-plugin-rubinate";
import { Document, Group, P, minitypeJSX } from "@minitype/tsx";
import { AutoRuby } from "minitype-plugin-rubinate/tsx";
${/const r\s*=/.test(code) ? "" : "const r = createRubinate();"}
${code}
await minitype([{ body: [${name === "analysis-table" ? "analysisTable" : /<AutoRuby/.test(code) ? "document.groups[0].body[0]" : "paragraph"}] }], {
  size: { width: 190, height: ${name === "analysis-table" ? 100 : name === "unidic" || name === "readings" || name === "dictionary-file" ? 36 : 24} },
  padding: { type: "physical", top: 7, bottom: 5, left: 5, right: 5 },
  block: { paragraph: { font: "SourceHanSerifJP-Regular", size: 4, lineHeight: 8, firstIndent: 0, indent: 0 } },
}).save(${JSON.stringify(fileURLToPath(new URL(`${name}.pdf`, generated)))});
`;
  const compiled = ts.transpileModule(moduleSource, {
    fileName: "example.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.ReactJSX, jsxImportSource: "@minitype/tsx" },
  });
  const modulePath = fileURLToPath(new URL(`${name}.js`, generated));
  await writeFile(modulePath, compiled.outputText);
  for (const [command, args] of [
    [process.execPath, [modulePath]],
    ["pdftoppm", ["-f", "1", "-l", "1", "-scale-to", "1500", "-png", "-singlefile",
      fileURLToPath(new URL(`${name}.pdf`, generated)), fileURLToPath(new URL(`${name}`, generated))]],
  ] as const) {
    const result = spawnSync(command, [...args], { stdio: "inherit", cwd: fileURLToPath(root) });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed for ${name}`);
  }
  const imagePath = fileURLToPath(new URL(`${name}.png`, generated));
  const trim = spawnSync("magick", [imagePath, "-trim", "+repage", "-bordercolor", "white", "-border", "12", "-strip", imagePath], { stdio: "inherit" });
  if (trim.error) throw trim.error;
  if (trim.status !== 0) throw new Error(`Standalone image trim failed for ${name}`);
  const bytes = await readFile(imagePath);
  const previous = rendered.get(name);
  if (previous && !previous.equals(bytes)) throw new Error(`Listings sharing ${name}.png produce different results`);
  if (!previous) {
    rendered.set(name, bytes);
    await writeFile(new URL(`assets/${name}.png`, docsDirectory), bytes);
  }
}
console.log(`Executed ${snippets.length} README listings; generated ${rendered.size} distinct result images.`);
