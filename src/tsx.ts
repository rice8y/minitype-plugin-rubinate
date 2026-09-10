import type { Ruby } from "@minitype/minitype";
import type { RubyOptions } from "./index.js";
import { createRubinateSync, type SyncRubinateConfig } from "./sync.js";

/** Text and conditional/interpolated text accepted by AutoRuby. */
export type AutoRubyText = string | number | boolean | null | undefined | readonly AutoRubyText[];
export interface AutoRubyProps extends RubyOptions {
  children?: AutoRubyText;
}

function collectText(children: AutoRubyText): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(collectText).join("");
  throw new TypeError("AutoRuby accepts only text children; place styled or manual ruby elements outside AutoRuby");
}

export type AutoRubyComponent = (props: AutoRubyProps) => (string | Ruby)[];

/** Create a synchronous TSX AutoRuby component with shared defaults. */
export function createAutoRuby(config: SyncRubinateConfig = {}): AutoRubyComponent {
  const rubinate = createRubinateSync(config);
  return function AutoRuby({ children, ...options }: AutoRubyProps): (string | Ruby)[] {
    return rubinate.autoRuby(collectText(children), options);
  };
}

/** Automatic ruby component using the default Rubinate configuration. */
export const AutoRuby = createAutoRuby();

export type { SyncRubinateConfig } from "./sync.js";
