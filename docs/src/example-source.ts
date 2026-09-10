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
      ts.isFunctionDeclaration(statement) && statement.name?.text === (example.sourceFile.pathname.endsWith(".tsx") ? "tsxRubyDocument" : example.render.name),
  );
  const body = declaration?.body;
  const finalStatement = body?.statements.at(-1);
  if (!body || !finalStatement || !ts.isReturnStatement(finalStatement) ||
    !finalStatement.expression || !ts.isIdentifier(finalStatement.expression) ||
    !["result", "document"].includes(finalStatement.expression.text)) {
    throw new Error(`${path}: ${example.render.name} must end with return result.`);
  }

  // Context parameters and the final return belong to the example wrapper; the
  // displayed body contains the same statements that produce the returned block.
  const resultDeclaration = body.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => declaration.name.getText(sourceFile) === "result");
  const returnsArray = resultDeclaration?.initializer && ts.isArrayLiteralExpression(resultDeclaration.initializer);
  let code = dedent(sourceFile.text.slice(body.getStart(sourceFile) + 1, finalStatement.getFullStart()));
  let imports = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map(statement => statement.getText(sourceFile))
    .join("\n");

  if (example.sourceFile.pathname.endsWith(".tsx")) {
    imports = imports.replace('import { Document, Group, P }', 'import { Document, Group, P, minitypeJSX }');
    code += '\n\nawait minitypeJSX(document).save("output.pdf");';
  } else {
    imports = imports.replace('import { ', 'import { minitype, ');
    code += `

const document = [{ body: ${returnsArray ? "result" : "[result]"} }];
await minitype(document).save("output.pdf");`;
  }
  imports = imports.replace('import { docsDirectory } from "../context.js";\n', '').replace('import { docsDirectory } from "../context.js";', '');
  code = code.replace('new URL("assets/dictionary.csv", docsDirectory)', '"./dictionary.csv"');
  return { code, imports: imports.trim() };
}

function dedent(source: string): string {
  const lines = source.replace(/^\s*\n/, "").trimEnd().split("\n");
  const indentation = Math.min(...lines.filter(line => line.trim()).map(line => line.search(/\S/)));
  return lines.map(line => line.slice(indentation)).join("\n");
}
