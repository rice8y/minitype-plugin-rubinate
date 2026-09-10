import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { minitype, vspace } from "@minitype/minitype";
import { examples } from "./examples.js";
import { readExampleSource } from "./example-source.js";
import { composePages, cover, documentStyle, codeListing, exampleFigure, text, note } from "./layout.js";
import { referencePages } from "./reference.js";
import { docsDirectory, outputFile, root } from "./context.js";
import type { ManualPage } from "./types.js";

const { version } = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as { version: string };
const compilationDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const pages: ManualPage[] = [];
const report: { title: string; page: number; source: string }[] = [];
const captionCounts = { Figure: 0, Table: 0 };
for (const example of examples) {
  const captionKind = example.captionKind ?? "Figure";
  const captionNumber = ++captionCounts[captionKind];
  const source = await readExampleSource(example);
  const result = await example.render();
  pages.push({
    section: example.section, title: example.title,
    body: [
      text(example.description), vspace(3),
      codeListing(`${source.imports}\n\n${source.code}`, example.sourceFile.pathname.endsWith(".tsx") ? "Executable TSX" : "Executable TypeScript"),
      vspace(4), ...exampleFigure(Array.isArray(result) ? result : [result], captionNumber, example.title, captionKind),
      vspace(3), note(example.note),
    ],
  });
  report.push({ title: example.title, page: pages.length + 1, source: `docs/src/examples/${example.sourceFile.pathname.split("/").at(-1)}` });
}
pages.push(...referencePages());
const createDocument = (pageNumbers = new Map<string, number>()) => minitype(
  [cover(pages, version, pageNumbers), ...composePages(pages, compilationDate)], documentStyle, {
    disableDefaultTransformers: true,
    metadata: { title: "minitype-plugin-rubinate documentation", author: "Eito Yoneyama", subject: "Quick Start, Usage, Public API and License" },
  });
let document = createDocument();
let pageNumbers = new Map<string, number>();
let stable = false;
for (let pass = 0; pass < 4; pass++) {
  const layout = await document.getLayout();
  const actual = new Map(layout.filter(block => block.label && block.pageIndex != null)
    .map(block => [block.label!, block.pageIndex! + 1]));
  if ([...actual].every(([label, page]) => pageNumbers.get(label) === page) && actual.size === pageNumbers.size) {
    stable = true;
    break;
  }
  pageNumbers = actual;
  document = createDocument(pageNumbers);
}
if (!stable) throw new Error("Contents page numbers did not stabilize");
const count = await document.getPageCount();
for (const [index, example] of report.entries()) {
  const page = pageNumbers.get(`entry-${index}`);
  if (page == null) throw new Error(`Missing heading layout: entry-${index}`);
  example.page = page;
}
await document.save(fileURLToPath(outputFile));
await mkdir(new URL(".generated/", docsDirectory), { recursive: true });
await writeFile(new URL(".generated/execution-report.json", docsDirectory), JSON.stringify({ version, pages: count, examples: report }, null, 2) + "\n");
console.log(`Saved docs/documentation.pdf: ${count} pages, ${report.length} executed examples.`);
