import fs from "fs";
import path from "path";

import { build } from "tsdown";
import ts from "typescript";

/**
 * Bubble Plugin build runner.
 * Compiles TS action and element files using tsdown programmatically and formats them
 * for copy-pasting into the Bubble plugin editor.
 */
export async function runBuild(): Promise<void> {
  const cwd = process.cwd();
  console.log(`Building Bubble plugin in ${cwd}...`);

  // Clean dist directory once at start
  const distDir = path.join(cwd, "dist");
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  // Scan src/actions
  const actionsDir = path.join(cwd, "src/actions");
  if (fs.existsSync(actionsDir)) {
    const files = fs.readdirSync(actionsDir).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const entry = path.join(actionsDir, file);
      const outName = file.replace(/\.ts$/, ".js");
      const outDir = path.join(cwd, "dist/actions");
      const outPath = path.join(outDir, outName);

      console.log(`Compiling action: ${file}`);

      // Call tsdown programmatically
      await build({
        entry: [entry],
        format: ["esm"],
        dts: false,
        clean: false,
        outDir,
        fixedExtension: false,
        config: false,
      });

      // Post-process to remove exports and append execution hook
      if (fs.existsSync(outPath)) {
        const rawContent = fs.readFileSync(outPath, "utf8");
        const { content, hasAction, isAsync } = processCode(rawContent);

        if (!hasAction) {
          console.warn(`Warning: Action file ${file} does not declare a function named 'action'.`);
        }

        let finalContent = content;

        // Check if server-side action or client-side action
        const isServerSide = file.endsWith("-server.ts") || isAsync;
        if (isServerSide) {
          finalContent += "\n\n// Execute server-side action\nreturn action(properties, context);";
        } else {
          finalContent += "\n\n// Execute action\naction(properties, context);";
        }

        fs.writeFileSync(outPath, finalContent, "utf8");
      }
    }
  }

  // Scan src/elements
  const elementsDir = path.join(cwd, "src/elements");
  if (fs.existsSync(elementsDir)) {
    const elements = fs.readdirSync(elementsDir).filter((f) => {
      return fs.statSync(path.join(elementsDir, f)).isDirectory();
    });

    for (const element of elements) {
      const elDir = path.join(elementsDir, element);
      const files = fs.readdirSync(elDir).filter((f) => f.endsWith(".ts"));

      for (const file of files) {
        const entry = path.join(elDir, file);
        const outName = file.replace(/\.ts$/, ".js");
        const outDir = path.join(cwd, "dist/elements", element);
        const outPath = path.join(outDir, outName);

        console.log(`Compiling element (${element}) file: ${file}`);

        await build({
          entry: [entry],
          format: ["esm"],
          dts: false,
          clean: false,
          outDir,
          fixedExtension: false,
          config: false,
        });

        if (fs.existsSync(outPath)) {
          const rawContent = fs.readFileSync(outPath, "utf8");
          const baseName = path.basename(file, ".ts");
          const { content, hasFunction } = processCode(rawContent, baseName);

          if (!hasFunction) {
            console.warn(`Warning: Element file ${file} does not declare a function named '${baseName}'.`);
          }

          let finalContent = content;
          if (baseName === "initialize") {
            finalContent += "\n\n// Initialize element\ninitialize(instance, context);";
          } else if (baseName === "update") {
            finalContent += "\n\n// Update element\nupdate(instance, properties, context);";
          } else if (baseName === "preview") {
            finalContent += "\n\n// Preview element\npreview(instance, properties, context);";
          }

          fs.writeFileSync(outPath, finalContent, "utf8");
        }
      }
    }
  }

  console.log("Build completed successfully.");
}

/**
 * Parses the generated JS using the TypeScript compiler API to strip ESM exports
 * and analyze declared functions without fragile regexes.
 *
 * @param content The bundled JavaScript code.
 * @param expectedFunctionName Optional function name to verify existence in the code.
 */
export function processCode(
  content: string,
  expectedFunctionName: string = "action",
): {
  content: string;
  hasAction: boolean;
  isAsync: boolean;
  hasFunction: boolean;
} {
  const sourceFile = ts.createSourceFile("temp.js", content, ts.ScriptTarget.Latest, true);

  let hasAction = false;
  let isAsync = false;
  let hasFunction = false;

  // We want to transform the AST:
  // 1. Remove 'export' and 'default' modifier from variable, function, class, etc. declarations.
  // 2. Remove export declarations like `export { foo }` or `export default foo` entirely.
  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.SourceFile) => {
      function visit(node: ts.Node): ts.Node | undefined {
        // Find if the target function is declared and inspect its async state
        if (ts.isFunctionDeclaration(node) && node.name) {
          const name = node.name.text;
          if (name === "action") {
            hasAction = true;
          }
          if (name === expectedFunctionName) {
            hasFunction = true;
          }
          if (name === "action" || name === expectedFunctionName) {
            const modifiers = ts.getModifiers(node);
            if (modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
              isAsync = true;
            }
          }
        } else if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              const name = decl.name.text;
              if (name === "action") {
                hasAction = true;
              }
              if (name === expectedFunctionName) {
                hasFunction = true;
              }
              if ((name === "action" || name === expectedFunctionName) && decl.initializer) {
                if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
                  const modifiers = ts.getModifiers(decl.initializer);
                  if (modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
                    isAsync = true;
                  }
                }
              }
            }
          }
        }

        // Strip exports
        if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
          return undefined; // remove
        }

        if (ts.canHaveModifiers(node)) {
          const modifiers = ts.getModifiers(node);
          if (modifiers && modifiers.length > 0) {
            const hasExport = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
            if (hasExport) {
              const newModifiers = modifiers.filter(
                (m) => m.kind !== ts.SyntaxKind.ExportKeyword && m.kind !== ts.SyntaxKind.DefaultKeyword,
              );

              // Reconstruct the node without export/default modifiers
              if (ts.isFunctionDeclaration(node)) {
                return ts.factory.updateFunctionDeclaration(
                  node,
                  newModifiers,
                  node.asteriskToken,
                  node.name,
                  node.typeParameters,
                  node.parameters,
                  node.type,
                  node.body,
                );
              }
              if (ts.isVariableStatement(node)) {
                return ts.factory.updateVariableStatement(node, newModifiers, node.declarationList);
              }
              if (ts.isClassDeclaration(node)) {
                return ts.factory.updateClassDeclaration(
                  node,
                  newModifiers,
                  node.name,
                  node.typeParameters,
                  node.heritageClauses,
                  node.members,
                );
              }
              if (ts.isInterfaceDeclaration(node)) {
                return ts.factory.updateInterfaceDeclaration(
                  node,
                  newModifiers,
                  node.name,
                  node.typeParameters,
                  node.heritageClauses,
                  node.members,
                );
              }
              if (ts.isTypeAliasDeclaration(node)) {
                return ts.factory.updateTypeAliasDeclaration(
                  node,
                  newModifiers,
                  node.name,
                  node.typeParameters,
                  node.type,
                );
              }
              if (ts.isEnumDeclaration(node)) {
                return ts.factory.updateEnumDeclaration(node, newModifiers, node.name, node.members);
              }
              if (ts.isModuleDeclaration(node)) {
                return ts.factory.updateModuleDeclaration(node, newModifiers, node.name, node.body);
              }
            }
          }
        }

        return ts.visitEachChild(node, visit, context);
      }
      return ts.visitNode(rootNode, visit) as ts.SourceFile;
    };
  };

  const result = ts.transform(sourceFile, [transformer]);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const transformedSourceFile = result.transformed[0] as ts.SourceFile;
  const newContent = printer.printFile(transformedSourceFile);
  result.dispose();

  // Remove final empty ESM export if rolldown added it (e.g. export {};)
  const cleanedContent = newContent.replace(/export\s*\{\s*\}\s*;?/g, "").trim();

  return {
    content: cleanedContent,
    hasAction,
    isAsync,
    hasFunction,
  };
}
