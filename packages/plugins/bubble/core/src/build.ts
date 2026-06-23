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

  const bubbleConfig = ensureBubbleConfig(cwd);

  // Process actions defined in bubble.json
  if (bubbleConfig.actions && bubbleConfig.actions.length > 0) {
    for (const actionConfig of bubbleConfig.actions) {
      await compileAction(cwd, actionConfig);
    }
  }

  // Process elements defined in bubble.json
  if (bubbleConfig.elements && bubbleConfig.elements.length > 0) {
    for (const elementConfig of bubbleConfig.elements) {
      await compileElement(cwd, elementConfig);
    }
  }

  console.log("Build completed successfully.");
}

/**
 * Ensures a valid bubble.json exists in the current directory.
 * Scans src/actions and src/elements to generate a default configuration if missing.
 *
 * @param cwd Current working directory.
 */
export function ensureBubbleConfig(cwd: string): {
  actions?: Array<{ name: string; type: string }>;
  elements?: Array<{ name: string }>;
} {
  const configPath = path.join(cwd, "bubble.json");
  if (!fs.existsSync(configPath)) {
    console.warn("Warning: bubble.json configuration file not found. Creating a default one...");

    const name = path.basename(cwd);
    const defaultConfig: {
      $schema: string;
      name: string;
      actions: Array<{ name: string; type: string }>;
      elements: Array<{ name: string }>;
    } = {
      $schema: "node_modules/bubble-plugin/bubble.schema.json",
      name: name
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      actions: [],
      elements: [],
    };

    // Scan src/actions (excluding .test.ts)
    const actionsDir = path.join(cwd, "src/actions");
    if (fs.existsSync(actionsDir)) {
      const files = fs.readdirSync(actionsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
      for (const file of files) {
        const fileBaseName = file.replace(/\.ts$/, "");
        const isServerSide = file.endsWith("-server.ts");
        defaultConfig.actions.push({
          name: fileBaseName,
          type: isServerSide ? "server" : "client",
        });
      }
    }

    // Scan src/elements
    const elementsDir = path.join(cwd, "src/elements");
    if (fs.existsSync(elementsDir)) {
      const dirs = fs.readdirSync(elementsDir).filter((f) => {
        return fs.statSync(path.join(elementsDir, f)).isDirectory();
      });
      for (const dir of dirs) {
        defaultConfig.elements.push({
          name: dir,
        });
      }
    }

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
    console.log("Successfully created default bubble.json.");
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    throw new Error(`Failed to parse bubble.json: ${(err as Error).message}`);
  }
}

/**
 * Compiles a single custom Bubble action.
 *
 * @param cwd Current working directory.
 * @param actionConfig Configuration for the action.
 */
export async function compileAction(cwd: string, actionConfig: { name: string; type: string }): Promise<void> {
  const actionsDir = path.join(cwd, "src/actions");
  const file = `${actionConfig.name}.ts`;
  const entry = path.join(actionsDir, file);

  if (!fs.existsSync(entry)) {
    throw new Error(`Action source file not found: ${entry}`);
  }

  const outName = `${actionConfig.name}.js`;
  const outDir = path.join(cwd, "dist/actions");
  const outPath = path.join(outDir, outName);

  console.log(`Compiling action: ${file}`);

  await build({
    entry: [entry],
    format: ["esm"],
    dts: false,
    clean: false,
    outDir,
    fixedExtension: false,
    config: false,
  });

  if (!fs.existsSync(outPath)) {
    throw new Error(`Build output file not found: ${outPath}`);
  }

  const rawContent = fs.readFileSync(outPath, "utf8");
  const { content, hasAction } = processCode(rawContent);

  if (!hasAction) {
    throw new Error(`Action file ${file} does not declare a function named 'action'.`);
  }

  let finalContent = content;
  const isServerSide = actionConfig.type === "server";

  if (isServerSide) {
    finalContent += "\n\n// Execute server-side action\nreturn action(properties, context);";
  } else {
    finalContent += "\n\n// Execute action\naction(properties, context);";
  }

  fs.writeFileSync(outPath, finalContent, "utf8");
}

/**
 * Compiles custom visual element lifecycle hooks.
 *
 * @param cwd Current working directory.
 * @param elementConfig Configuration for the visual element.
 */
export async function compileElement(cwd: string, elementConfig: { name: string }): Promise<void> {
  const element = elementConfig.name;
  const elementsDir = path.join(cwd, "src/elements");
  const elDir = path.join(elementsDir, element);

  if (!fs.existsSync(elDir)) {
    throw new Error(`Element directory not found: ${elDir}`);
  }

  const standardHooks = ["initialize", "update", "preview"];
  let hasAnyHook = false;

  for (const hook of standardHooks) {
    const entry = path.join(elDir, `${hook}.ts`);
    if (fs.existsSync(entry)) {
      hasAnyHook = true;
      const outName = `${hook}.js`;
      const outDir = path.join(cwd, "dist/elements", element);
      const outPath = path.join(outDir, outName);

      console.log(`Compiling element (${element}) file: ${hook}.ts`);

      await build({
        entry: [entry],
        format: ["esm"],
        dts: false,
        clean: false,
        outDir,
        fixedExtension: false,
        config: false,
      });

      if (!fs.existsSync(outPath)) {
        throw new Error(`Build output file not found: ${outPath}`);
      }

      const rawContent = fs.readFileSync(outPath, "utf8");
      const { content, hasFunction } = processCode(rawContent, hook);

      if (!hasFunction) {
        throw new Error(`Element file ${hook}.ts does not declare a function named '${hook}'.`);
      }

      let finalContent = content;
      if (hook === "initialize") {
        finalContent += "\n\n// Initialize element\ninitialize(instance, context);";
      } else if (hook === "update") {
        finalContent += "\n\n// Update element\nupdate(instance, properties, context);";
      } else if (hook === "preview") {
        finalContent += "\n\n// Preview element\npreview(instance, properties, context);";
      }

      fs.writeFileSync(outPath, finalContent, "utf8");
    }
  }

  if (!hasAnyHook) {
    console.warn(`Warning: Element ${element} does not contain any of initialize.ts, update.ts, or preview.ts.`);
  }
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
  hasFunction: boolean;
} {
  const sourceFile = ts.createSourceFile("temp.js", content, ts.ScriptTarget.Latest, true);

  let hasAction = false;
  let hasFunction = false;

  // Transform AST to remove export modifiers and assignments.
  const transformer = (context: ts.TransformationContext) => {
    return (rootNode: ts.SourceFile) => {
      function visit(node: ts.Node): ts.Node | undefined {
        if (ts.isFunctionDeclaration(node) && node.name) {
          const name = node.name.text;
          if (name === "action") {
            hasAction = true;
          }
          if (name === expectedFunctionName) {
            hasFunction = true;
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
            }
          }
        }

        // Strip export statements entirely
        if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
          return undefined;
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
    hasFunction,
  };
}
