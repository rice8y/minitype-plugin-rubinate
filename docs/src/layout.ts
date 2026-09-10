import {
  box, getFontKeys, h1, h2, lstlisting, p, page as currentPage, rgb, table, vspace,
  type Block, type Body, type Border, type Borders, type DocumentStyle,
  type Flow, type Group, type PhysicalPadding, type TextStyle,
} from "@minitype/minitype";
import type { ManualPage, Section } from "./types.js";

const fonts = new Set(getFontKeys());
const serif = "SourceHanSerifJP-Regular";
const monospace = "NOTONOTO35HS-Regular";
const sans = "SourceHanSansJP-Bold";

const colors = {
  ink: rgb(35, 31, 32),
  accent: rgb(42, 59, 77),
  muted: rgb(110, 110, 110),
  rule: rgb(205, 210, 212),
  note: rgb(243, 244, 245),
  white: rgb(255, 255, 255),
};

const sectionNumbers: Record<Section, number> = {
  "Quick Start": 1,
  "Usage": 2,
  "Public API": 3,
  "License": 4,
};

function padding(vertical: number, horizontal = vertical): PhysicalPadding {
  return { type: "physical", top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

function border(color = colors.rule, width = 0.15): Border {
  return { color, styles: [{ width }] };
}

function allBorders(line: Border): Borders {
  return { type: "physical", top: line, bottom: line, left: line, right: line };
}

const bodyStyle: Partial<TextStyle> = {
  font: serif,
  size: 3.9,
  lineHeight: 5.25,
  indent: 0,
  firstIndent: 0,
  effects: [{ type: "fill", color: colors.ink }],
};

export const documentStyle: Partial<DocumentStyle> = {
  size: "A4",
  padding: { type: "physical", top: 25, bottom: 24, left: 27, right: 23 },
  block: {
    paragraph: bodyStyle,
    caption: { ...bodyStyle, size: 3.4, lineHeight: 4.6, align: "center" },
  },
  gaps: [["paragraph", "paragraph", 2], ["box", "paragraph", 1.5], ["paragraph", "box", 2]],
};

export function text(content: string) {
  return p(content, bodyStyle);
}

export function label(content: string) {
  return p(content, {
    ...bodyStyle,
    font: sans,
    size: 3.8,
    lineHeight: 5.2,
    effects: [{ type: "fill", color: colors.accent }],
  });
}

export function codeListing(source: string, title: string, lineNumbers = true, language = "typescript") {
  const listing = lstlisting(source, {
    lang: language,
    title,
    showLineNumbers: lineNumbers,
    style: {
      codeStyle: { font: monospace, size: 3.05, lineHeight: 4.15, indent: 0, firstIndent: 0, color: colors.ink },
      lineNumberStyle: { font: monospace, size: 2.85, lineHeight: 4.15 },
      lineNumberColumnWidth: 8,
      lineNumberColor: colors.muted,
      codePadding: padding(2.5, 2),
      lineNumberPadding: padding(2.5, 1),
      titlePadding: padding(1.5, 3),
      titleBackgroundColor: colors.accent,
      titleColor: colors.white,
      border: allBorders(border(colors.accent, 0.2)),
      titleBorder: false,
      backgroundColor: colors.white,
      boldFont: monospace,
      italicFont: monospace,
      highlight: {
        class: {
          "hljs": { color: colors.ink },
          "hljs-keyword": { color: rgb(119, 47, 74) },
          "hljs-string": { color: rgb(34, 88, 64) },
          "hljs-number": { color: rgb(133, 69, 25) },
          "hljs-title": { color: rgb(46, 65, 114) },
          "hljs-type": { color: rgb(46, 65, 114) },
          "hljs-built_in": { color: rgb(46, 65, 114) },
          "hljs-literal": { color: rgb(119, 47, 74) },
          "hljs-comment": { color: rgb(95, 100, 106) },
          "hljs-attr": { color: rgb(45, 63, 85) },
        }
      },
    },
  });
  // minitype represents the listing title as a caption. Override this title
  // locally so figure captions retain their centered alignment.
  const header = listing.blocks[0];
  if (header?.type === "box") {
    const titleBlock = header.blocks[0];
    if (titleBlock?.type === "text") {
      titleBlock.style = { ...titleBlock.style, align: "left" };
    }
  }
  return box([listing], { splitable: false });
}

export function referenceCode(source: string) {
  return box([codeListing(source, "TypeScript reference", false), vspace(3)]);
}

export function note(content: string) {
  return box([p(content, { ...bodyStyle, size: 3.65, lineHeight: 4.8 })], {
    padding: padding(2.6, 3),
    background: [{ type: "fill", color: colors.note }],
    border: { type: "physical", left: border(colors.accent, 0.7) },
  });
}

export function exampleFigure(blocks: Block[], number: number, title: string, kind: "Figure" | "Table" = "Figure"): Block[] {
  // Ruby sits above the base line: prose leading and a tight frame clip it.
  const spaced = blocks.map(block => block.type === "text" ? {
    ...block,
    style: {
      ...block.style,
      size: block.style?.size ?? 4,
      lineHeight: block.style?.lineHeight ?? 9,
      indent: 0,
      firstIndent: 0,
      align: "left" as const,
    },
  } : block);
  return [
    box(spaced, { padding: padding(5, 3) }),
    p(`${kind} ${number}. ${title}.`, { ...bodyStyle, size: 3.4, lineHeight: 4.6, align: "center" }),
  ];
}

function runningText(content: string, x: number, y: number, width: number, align: "left" | "right" = "left"): Flow {
  return {
    type: "flow",
    position: "page",
    inlineOffset: x,
    blockOffset: y,
    inlineSize: width,
    blocks: [p(content, {
      ...bodyStyle, size: 3.1, lineHeight: 4.5, align,
      effects: [{ type: "fill", color: colors.muted }],
    })],
  };
}

export function composePages(pages: ManualPage[], compilationDate: string): Group[] {
  const groups: Group[] = [];
  let section: Section | undefined;
  let subsection = 0;
  for (const [index, entry] of pages.entries()) {
    const number = sectionNumbers[entry.section];
    if (entry.section !== section) {
      section = entry.section;
      subsection = 0;
      const footer = runningText("", 178, 282, 9, "right");
      footer.blocks = [p([[currentPage]], { ...bodyStyle, size: 3.1, align: "right" })];
      groups.push({ body: [
        runningText(compilationDate, 27, 282, 145),
        footer,
        { ...h1(`${number} ${section}`, { size: 7, font: sans, lineHeight: 10 }),
          unnumbered: true, label: `section-${number}` },
        vspace(5),
      ] });
    }
    if (!entry.title) {
      groups.at(-1)!.body.push(...entry.body);
      continue;
    }
    subsection += 1;
    const heading = { ...h2(`${number}.${subsection} ${entry.title}`, {
      size: 5.2, font: sans, lineHeight: 7,
    }), unnumbered: true, label: `entry-${index}` };
    // Keep short introductory examples, their output and explanation together.
    if (entry.section === "Quick Start") {
      groups.at(-1)!.body.push(
        ...(subsection > 1 ? [vspace(8)] : []),
        box([heading, vspace(3), ...entry.body] as Block[], { splitable: false }),
      );
      continue;
    }
    // Keep each H2 with its first content block, without forcing a new page.
    const prefix = entry.section === "Public API" && entry.body[1]?.type === "box" ? 2 : 1;
    groups.at(-1)!.body.push(
      ...(subsection > 1 ? [vspace(8)] : []),
      box([heading, vspace(3), ...entry.body.slice(0, prefix)] as Block[], { splitable: false }),
      ...entry.body.slice(prefix),
    );
  }
  return groups;
}

interface ContentsEntry {
  title: string;
  target: string;
  isSection: boolean;
}

function contents(entries: ContentsEntry[], pageNumbers: Map<string, number>) {
  const boldSerif = fonts.has("Times New Roman Bold")
    ? "Times New Roman Bold"
    : "SourceHanSerifJP-Bold";
  const noBorder: Border = {
    color: colors.ink,
    styles: [{ width: 0, enabled: false }],
  };

  return table(entries.map(entry => [
    {
      type: "tableCell",
      block: p(entry.title, {
        ...bodyStyle,
        font: entry.isSection ? boldSerif : serif,
        size: 3.6,
        lineHeight: 5,
        indent: entry.isSection ? 0 : 5,
      }),
    },
    {
      type: "tableCell",
      block: p(String(pageNumbers.get(entry.target) ?? ""), {
        ...bodyStyle, size: 3.6, lineHeight: 5, align: "right",
      }),
    },
  ]), {
    columnWidths: [151, 9],
    cellPadding: row => ({
      ...padding(0.55, 0),
      top: row > 0 && entries[row]?.isSection ? 2 : 0.55,
    }),
    horizontalBorders: noBorder,
    verticalBorders: noBorder,
  });
}

export function cover(pages: ManualPage[], version: string, pageNumbers = new Map<string, number>()): Group {
  const entries: ContentsEntry[] = [];
  let lastSection: Section | undefined;
  let subsection = 0;
  for (const [index, page] of pages.entries()) {
    if (page.continuation) continue;
    const sectionNumber = sectionNumbers[page.section];
    if (page.section !== lastSection) {
      entries.push({ title: `${sectionNumber}  ${page.section}`, target: `section-${sectionNumber}`, isSection: true });
      lastSection = page.section;
      subsection = 0;
    }
    if (!page.title) continue;
    subsection += 1;
    entries.push({
      title: `${sectionNumber}.${subsection}  ${page.title}`,
      target: `entry-${index}`,
      isSection: false,
    });
  }

  return {
    body: [
      vspace(8),
      p("minitype-plugin-rubinate", {
        ...bodyStyle, size: 7, lineHeight: 9, align: "center",
      }),
      vspace(4),
      p("Eito Yoneyama", { ...bodyStyle, size: 4.2, align: "center" }),
      p(`Version ${version}`, { ...bodyStyle, size: 3.9, align: "center" }),
      vspace(6),
      text("Automatic Japanese ruby for minitype. " +
        "Uses Lindera with IPADIC or UniDic and furigana correspondence."),
      vspace(6),
      p("Contents", { ...bodyStyle, size: 5, lineHeight: 7 }),
      vspace(2),
      contents(entries, pageNumbers),
    ],
  };
}
