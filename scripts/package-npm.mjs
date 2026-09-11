import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publish = process.argv[2] === "--publish";
const args = process.argv.slice(publish ? 3 : 2);
if (!publish && args.length) throw new Error("Use npm run pack:npm without arguments");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args, cwd = root, capture = false) => execFileSync(npm, args, {
  cwd, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
});

run(["run", "build"]);
run(["run", "check"]);
const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const destination = join(root, "tmp", "npm");
await mkdir(destination, { recursive: true });
const staging = await mkdtemp(join(tmpdir(), "rubinate-npm-"));
try {
  // Ask npm for its file list so package.json's files field stays authoritative.
  const [manifest] = JSON.parse(run(["pack", "--dry-run", "--ignore-scripts", "--json"], root, true));
  for (const { path } of manifest.files) {
    const target = join(staging, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, path), target);
  }
  const readmePath = join(staging, "README.md");
  const readme = await readFile(readmePath, "utf8");
  const base = `https://raw.githubusercontent.com/rice8y/minitype-plugin-rubinate/v${metadata.version}/`;
  await writeFile(readmePath, readme.replace(/(!\[[^\]]*\]\()(?:(?:\.\/)?)(docs\/assets\/[^)]+)(\))/g,
    (_, before, path, after) => `${before}${base}${path}${after}`));
  // The staged package already contains built output; do not run lifecycle hooks again.
  const [packed] = JSON.parse(run(["pack", "--ignore-scripts", "--json", "--pack-destination", destination], staging, true));
  const archive = resolve(destination, packed.filename);
  console.log(`npm package: ${archive}`);
  if (publish) run(["publish", archive, ...args]);
} finally {
  await rm(staging, { recursive: true, force: true });
}
