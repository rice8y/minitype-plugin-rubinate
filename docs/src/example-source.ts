import { readFile } from "node:fs/promises";
import ts from "typescript";
import type { Example } from "./types.js";

const sourceFiles = new Map<string, ts.SourceFile>();

/** Read the checked-in function body, not transpiled Function.toString() output. */
export async function readExampleSource(example: Example) {
  const path = example.sourceFile.href;
  let sourceFile = sourceFiles.get(path);
  if (!sourceFile) {
    const source = await readFile(example.sourceFile, "utf8");
    sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, example.sourceFile.pathname.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    sourceFiles.set(path, sourceFile);
  }

  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === example.render.name,
  );
  const body = declaration?.body;
  const finalStatement = body?.statements.at(-1);
  if (!body || !finalStatement || !ts.isReturnStatement(finalStatement) ||
    !finalStatement.expression || !ts.isIdentifier(finalStatement.expression) ||
    finalStatement.expression.text !== "result") {
    throw new Error(`${path}: ${example.render.name} must end with return result.`);
  }

  // Context parameters and the final return belong to the example wrapper; the
  // displayed body contains the same statements that produce the returned block.
  const code = dedent(sourceFile.text.slice(body.getStart(sourceFile) + 1, finalStatement.getFullStart()));
  const imports = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .filter(statement => !statement.importClause?.isTypeOnly)
    .map(statement => statement.getText(sourceFile))
    .join("\n");

  return { code, imports };
}

function dedent(source: string): string {
  const lines = source.replace(/^\s*\n/, "").trimEnd().split("\n");
  const indentation = Math.min(...lines.filter(line => line.trim()).map(line => line.search(/\S/)));
  return lines.map(line => line.slice(indentation)).join("\n");
}
