/** @jsxImportSource @minitype/tsx */
import { mkdir } from "node:fs/promises";
import { em } from "@minitype/minitype";
import { Document, Group, P, minitypeJSX } from "@minitype/tsx";
import { AutoRuby } from "minitype-plugin-rubinate/tsx";

const document = (
  <Document
    style={{
      block: {
        paragraph: {
          size: 4,
          lineHeight: em(2),
          rubySize: em(0.5),
          rubyOffset: em(0.1),
        },
      },
    }}
  >
    <Group>
      <P>
        <AutoRuby>東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。</AutoRuby>
      </P>
      <P>
        <AutoRuby dictionary="unidic">お茶を淹れる。</AutoRuby>
      </P>
      <P>
        <AutoRuby readings={{ "赤羽橋駅": "あかばねばしえき" }}>
          東京タワーの最寄駅は赤羽橋駅です。
        </AutoRuby>
      </P>
    </Group>
  </Document>
);

await mkdir("output/pdf", { recursive: true });
await minitypeJSX(document).save("output/pdf/rubinate-tsx-example.pdf");
