import { normalize, Path } from '@angular-devkit/core';
import {
  createScanner,
  createSourceFile,
  getTrailingCommentRanges,
  ImportDeclaration,
  ImportSpecifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isNamedImports,
  isNamespaceImport,
  isStringLiteral,
  LanguageVariant,
  Node,
  ScriptTarget,
  SourceFile,
  SyntaxKind,
} from 'typescript';
import { DeclarationOptions } from './module.declarator.js';
import { PathSolver } from './path.solver.js';

/**
 * The `ModuleImportDeclarator` class is responsible for declaring module imports
 * in a TypeScript file. It provides methods to insert import statements into the
 * file content based on the provided declaration options.
 */
export class ModuleImportDeclarator {
  constructor(private solver: PathSolver = new PathSolver()) {}

  /**
   * Declares a module import in the given content string.
   *
   * @param content - The content of the file where the import will be declared.
   * @param options - The options for the declaration, including the symbol and path.
   * @returns The updated content string with the import statement inserted.
   */
  public declare(content: string, options: DeclarationOptions): string {
    const source = createSourceFile(
      options.module,
      content,
      ScriptTarget.Latest,
      true,
    );
    const imports = source.statements.filter(isImportDeclaration);
    const symbol = String(options.symbol);
    const path = this.computeRelativePath(options);
    const conflictMessage = `Cannot import '${symbol}' from '${path}': the name is already bound by another import.`;

    if (
      source.statements.some(
        (statement) =>
          isImportEqualsDeclaration(statement) &&
          statement.name.text === symbol,
      )
    ) {
      throw new Error(conflictMessage);
    }

    for (const declaration of imports) {
      const clause = declaration.importClause;
      if (!clause) continue;

      const bindings = clause.namedBindings;
      const specifier =
        bindings && isNamedImports(bindings)
          ? bindings.elements.find((element) => element.name.text === symbol)
          : undefined;
      if (
        specifier &&
        (specifier.propertyName ?? specifier.name).text === symbol &&
        isStringLiteral(declaration.moduleSpecifier) &&
        declaration.moduleSpecifier.text === path
      ) {
        return this.promoteTypeImport(content, source, declaration, specifier);
      }

      if (
        specifier ||
        clause.name?.text === symbol ||
        (bindings &&
          isNamespaceImport(bindings) &&
          bindings.name.text === symbol)
      ) {
        throw new Error(conflictMessage);
      }
    }

    const toInsert = this.buildLineToInsert(options);
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const lastImport = imports.at(-1);
    if (lastImport) {
      const comments = getTrailingCommentRanges(content, lastImport.end);
      const position = comments?.at(-1)?.end ?? lastImport.end;
      return (
        content.slice(0, position) +
        newline +
        toInsert +
        content.slice(position)
      );
    }

    const position = source.statements[0]?.getStart(source) ?? content.length;
    const prefix = content.slice(0, position);
    return (
      prefix +
      (prefix && !prefix.endsWith('\n') ? newline : '') +
      toInsert +
      newline +
      content.slice(position)
    );
  }

  /**
   * Makes the existing binding available at runtime, preserving comments and
   * keeping the other specifiers in a type-only declaration type-only.
   */
  private promoteTypeImport(
    content: string,
    source: SourceFile,
    declaration: ImportDeclaration,
    specifier: ImportSpecifier,
  ): string {
    const clause = declaration.importClause!;
    const edits: { start: number; end: number; text: string }[] = [];
    const removeTypeKeyword = (node: Node) => {
      const token = node.getFirstToken(source)!;
      const end = token.end + (/[ \t]/.test(content[token.end] ?? '') ? 1 : 0);
      edits.push({ start: token.getStart(source), end, text: '' });
    };

    if (clause.isTypeOnly) {
      removeTypeKeyword(clause);
      const attributes = declaration.attributes;
      if (
        attributes?.elements.length === 1 &&
        attributes.elements[0].name.text === 'resolution-mode'
      ) {
        // This attribute is only legal on type-only declarations. The matched
        // relative service path resolves to the same file in either mode.
        let start = attributes.getStart(source);
        const scanner = createScanner(
          ScriptTarget.Latest,
          false,
          LanguageVariant.Standard,
          content.slice(start, attributes.end),
        );
        const comments: string[] = [];
        const newline = content.includes('\r\n') ? '\r\n' : '\n';
        for (
          let token = scanner.scan();
          token !== SyntaxKind.EndOfFileToken;
          token = scanner.scan()
        ) {
          if (token === SyntaxKind.MultiLineCommentTrivia) {
            comments.push(scanner.getTokenText());
          } else if (token === SyntaxKind.SingleLineCommentTrivia) {
            comments.push(scanner.getTokenText() + newline);
          }
        }
        const text = comments.join(' ');
        if (!text && /[ \t]/.test(content[start - 1] ?? '')) start--;
        edits.push({ start, end: attributes.end, text });
      }
      const bindings = clause.namedBindings;
      if (bindings && isNamedImports(bindings)) {
        for (const other of bindings.elements) {
          if (other !== specifier && !other.isTypeOnly) {
            const start = other.getStart(source);
            edits.push({ start, end: start, text: 'type ' });
          }
        }
      }
    }
    if (specifier.isTypeOnly) {
      removeTypeKeyword(specifier);
    }
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      content =
        content.slice(0, edit.start) + edit.text + content.slice(edit.end);
    }
    return content;
  }

  /**
   * Builds the import line to insert based on the declaration options.
   *
   * @param options - The options for the declaration, including the symbol and path.
   * @returns The import line to insert.
   */
  private buildLineToInsert(options: DeclarationOptions): string {
    return `import { ${options.symbol} } from '${this.computeRelativePath(
      options,
    )}';`;
  }

  /**
   * Computes the relative path for the import statement.
   *
   * @param options - The options for the declaration, including the symbol and path.
   * @returns The relative path for the import statement.
   */
  private computeRelativePath(options: DeclarationOptions): string {
    let importModulePath: Path;
    if (options.type !== undefined) {
      importModulePath = normalize(
        `/${options.path}/${options.name}.${options.type}`,
      );
    } else {
      importModulePath = normalize(`/${options.path}/${options.name}`);
    }
    const relativePath = this.solver.relative(options.module, importModulePath);
    return options.isEsm ? `${relativePath}.js` : relativePath;
  }
}
