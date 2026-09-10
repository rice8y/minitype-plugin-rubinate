import { readFile } from "node:fs/promises";

/** Import-free WASM host using explicit input/output buffer ownership. */
async function createHost(name: string) {
  const bytes = await readFile(new URL(`../assets/${name}.wasm`, import.meta.url));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const { memory, alloc, dealloc } = instance.exports;
  if (!(memory instanceof WebAssembly.Memory) || typeof alloc !== "function" || typeof dealloc !== "function") {
    throw new Error(`Invalid WASM buffer ABI: ${name}`);
  }
  return (entry: string, value: unknown): unknown => {
    const fn = instance.exports[entry];
    if (typeof fn !== "function") throw new Error(`Missing WASM export: ${entry}`);
    const input = new TextEncoder().encode(JSON.stringify(value));
    const inputPointer = alloc(input.length) >>> 0;
    let outputPointer: number | undefined;
    let outputLength = 0;
    try {
      new Uint8Array(memory.buffer, inputPointer, input.length).set(input);
      const packed = BigInt.asUintN(64, fn(inputPointer, input.length));
      outputPointer = Number(packed >> 32n);
      outputLength = Number(packed & 0xffffffffn);
      // The call can grow memory, so obtain its current buffer after returning.
      const output = new Uint8Array(memory.buffer, outputPointer, outputLength);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(output);
      if (text.startsWith("Error:")) throw new Error(`${name}: ${text}`);
      return JSON.parse(text);
    } finally {
      if (outputPointer !== undefined) dealloc(outputPointer, outputLength);
      dealloc(inputPointer, input.length);
    }
  };
}

const hosts = new Map<string, Promise<Awaited<ReturnType<typeof createHost>>>>();
export async function callWasm(name: "ipadic" | "unidic" | "jmdict_furigana", entry: string, value: unknown): Promise<unknown> {
  let host = hosts.get(name);
  if (!host) {
    host = createHost(name);
    hosts.set(name, host);
  }
  try {
    // Each invocation is synchronous after loading. Modules load only when needed.
    return (await host)(entry, value);
  } catch (error) {
    if (hosts.get(name) === host) hosts.delete(name);
    throw error;
  }
}
