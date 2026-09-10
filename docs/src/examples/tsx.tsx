import { Document, Group, P } from "@minitype/tsx";
import { AutoRuby } from "minitype-plugin-rubinate/tsx";

export function tsxRubyDocument() {
  const document = (
    <Document>
      <Group>
        <P>
          <AutoRuby>東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。</AutoRuby>
        </P>
      </Group>
    </Document>
  );
  return document;
}

export function tsxRuby() {
  const document = tsxRubyDocument();
  if (!document || typeof document !== "object" || !("groups" in document)) {
    throw new Error("Expected a TSX document");
  }
  return document.groups.flatMap(group => group.body).filter(
    (block): block is import("@minitype/minitype").Block => "type" in block && block.type === "text",
  );
}
