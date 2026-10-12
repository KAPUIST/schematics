import { normalize } from '@angular-devkit/core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProgram,
  flattenDiagnosticMessageText,
  getPreEmitDiagnostics,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
} from 'typescript';
import { ModuleDeclarator } from '../../src/utils/module.declarator.js';

describe('Generated module imports', () => {
  it.each([false, true])(
    'should compile and remain unchanged on a second run (isEsm: %s)',
    (isEsm) => {
      const root = mkdtempSync(join(tmpdir(), 'nest-module-import-'));
      try {
        mkdirSync(join(root, 'users'));
        mkdirSync(join(root, 'legacy'));
        writeFileSync(join(root, 'package.json'), '{"type":"module"}');
        writeFileSync(
          join(root, 'module.ts'),
          'export function Module(options: { providers: unknown[] }): ClassDecorator { return () => {}; }',
        );
        writeFileSync(
          join(root, 'users/users.service.ts'),
          'export class UsersService {}\n' +
            'export class AdminUsersService {}\n' +
            'export interface UserOptions { name: string }\n' +
            'export default class DefaultService {}\n',
        );
        writeFileSync(
          join(root, 'legacy/users.service.ts'),
          'export class UsersService {}',
        );
        const path = `./users/users.service${isEsm ? '.js' : ''}`;
        const scenarios = [
          `import { UsersService } from '${path}';`,
          `import { UsersService /* legacy */ as LegacyUsers } from '${path}';`,
          `import { UsersService // legacy\n as LegacyUsers } from '${path}';`,
          `import { /* UsersService */ AdminUsersService } from '${path}';`,
          `import { type UsersService } from '${path}';`,
          `import { type /* keep */ UsersService, type UserOptions } from '${path}';`,
          `import type { UsersService } from '${path}';`,
          `import type /* keep */ { UsersService, UserOptions as Options } from '${path}';`,
          `import type { UserOptions, UsersService as UsersService } from '${path}';`,
          `import type { UsersService, UserOptions } from '${path}' with { /* mode note */ 'resolution-mode': 'require' };`,
          `import type { UsersService, UserOptions } from '${path}' with { 'resolution-mode': 'import' };`,
          `import type { UsersService } from '${path}' with { // mode note\n 'resolution-mode': 'require' };`,
          `import type { UsersService as LegacyUsers } from '${path}';`,
          `import DefaultService, { UsersService } from '${path}';`,
          `import /* keep */ { UsersService } /* keep */ from '${path}';`,
          `/*\nimport { UsersService } from '${path}';\n*/`,
          `const example = \`\nimport { UsersService } from '${path}';\n\`;`,
          `import { UsersService /* keep */ as LegacyUsers }\n from '${path}'; // keep`,
          `import { UsersService as LegacyUsers } from './legacy/users.service${isEsm ? '.js' : ''}';`,
        ];
        const files = scenarios.map((imports, index) => {
          const file = join(root, `app-${index}.ts`);
          const input =
            "import { Module } from './module.js';\n" +
            imports +
            '\n@Module({})\nexport class AppModule {}\n';
          const options = {
            metadata: 'providers',
            type: 'service',
            name: 'users',
            path: normalize(join(root, 'users')),
            module: normalize(file),
            isEsm,
          };
          const declarator = new ModuleDeclarator();
          const output = declarator.declare(input, options);
          expect(output).toContain('providers: [UsersService]');
          expect(declarator.declare(output, options)).toEqual(output);
          writeFileSync(file, output);
          return file;
        });
        const program = createProgram(files, {
          noEmit: true,
          experimentalDecorators: true,
          skipLibCheck: true,
          strict: true,
          verbatimModuleSyntax: true,
          target: ScriptTarget.ES2023,
          module: isEsm ? ModuleKind.NodeNext : ModuleKind.ESNext,
          moduleResolution: isEsm
            ? ModuleResolutionKind.NodeNext
            : ModuleResolutionKind.Bundler,
        });
        const diagnostics = getPreEmitDiagnostics(program).map(
          (diagnostic) => ({
            file: diagnostic.file?.fileName,
            code: diagnostic.code,
            message: flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          }),
        );
        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
