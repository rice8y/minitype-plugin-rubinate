import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

/** Validate the three-column user CSV supported by auto-jrubby's Lindera fork. */
export function validateUserDictionary(csv: string): void {
  if (!csv.trim()) return;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const invalid = () => { throw new TypeError("userDictionary must be valid three-column CSV: surface,part-of-speech,kana-reading"); };
  const endField = () => { row.push(field); field = ""; closed = false; };
  const endRow = () => { endField(); if (row.length !== 1 || row[0] !== "") rows.push(row); row = []; };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (quoted) {
      if (c === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += c;
    } else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      endRow();
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"') invalid();
      field += c;
    }
  }
  if (quoted) invalid();
  endRow();
  if (!rows.length) invalid();
  for (const fields of rows) {
    if (fields.length !== 3 || !fields[0] || !fields[1] || !/^[\p{Script=Hiragana}\p{Script=Katakana}ー\u3099\u309a]+$/u.test(fields[2]!)) invalid();
  }
}

export async function loadUserDictionary(csv?: string, path?: string | URL): Promise<string | undefined> {
  if (csv !== undefined && path !== undefined) throw new TypeError("Specify only one of userDictionary and userDictionaryPath");
  if (csv !== undefined && typeof csv !== "string") throw new TypeError("userDictionary must be a CSV string");
  if (path !== undefined) {
    if (!(typeof path === "string" && path.length > 0) && !(path instanceof URL && path.protocol === "file:")) {
      throw new TypeError("userDictionaryPath must be a nonempty filesystem path or file URL");
    }
    csv = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  }
  csv = csv?.replace(/^\uFEFF/, "");
  if (csv !== undefined) validateUserDictionary(csv);
  return csv?.trim() ? csv : undefined;
}

/** Synchronous counterpart used by the TSX component path. */
export function loadUserDictionarySync(csv?: string, path?: string | URL): string | undefined {
  if (csv !== undefined && path !== undefined) throw new TypeError("Specify only one of userDictionary and userDictionaryPath");
  if (csv !== undefined && typeof csv !== "string") throw new TypeError("userDictionary must be a CSV string");
  if (path !== undefined) {
    if (!(typeof path === "string" && path.length > 0) && !(path instanceof URL && path.protocol === "file:")) {
      throw new TypeError("userDictionaryPath must be a nonempty filesystem path or file URL");
    }
    csv = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  }
  csv = csv?.replace(/^\uFEFF/, "");
  if (csv !== undefined) validateUserDictionary(csv);
  return csv?.trim() ? csv : undefined;
}
