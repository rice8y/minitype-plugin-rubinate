import type { Block, Body } from "@minitype/minitype";
export type Section = "Quick Start" | "Usage" | "Public API" | "License";
export interface ManualPage {
  section: Section;
  title?: string;
  body: Body;
  continuation?: boolean;
}
export interface Example {
  captionKind?: "Figure" | "Table";
  section: Section;
  title: string;
  description: string;
  note: string;
  sourceFile: URL;
  render: () => Block | Block[] | Promise<Block | Block[]>;
}
