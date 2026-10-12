import { normalize } from '@angular-devkit/core';
import { ModuleImportDeclarator } from '../../src/utils/module-import.declarator.js';
import { DeclarationOptions } from '../../src/utils/module.declarator.js';

describe('Module Import Declarator', () => {
  it('should add import to the buffered module content', () => {
    const content: string =
      "import { Module } from '@nestjs/common';\n" +
      '\n' +
      '@Module({})\n' +
      'export class FooModule {}\n';
    const options: DeclarationOptions = {
      metadata: 'imports',
      type: 'module',
      name: 'bar',
      path: normalize('/src/foo/bar'),
      module: normalize('/src/foo/foo.module.ts'),
      symbol: 'BarModule',
    };
    const declarator = new ModuleImportDeclarator();
    expect(declarator.declare(content, options)).toEqual(
      "import { Module } from '@nestjs/common';\n" +
        "import { BarModule } from './bar/bar.module';\n" +
        '\n' +
        '@Module({})\n' +
        'export class FooModule {}\n',
    );
  });

  it('should manage no type', () => {
    const content: string =
      "import { Module } from '@nestjs/common';\n" +
      '\n' +
      '@Module({})\n' +
      'export class FooModule {}\n';
    const options: DeclarationOptions = {
      metadata: 'providers',
      name: 'foo',
      path: normalize('/src/foo'),
      module: normalize('/src/foo/foo.ts'),
      symbol: 'Foo',
    };
    const declarator = new ModuleImportDeclarator();
    expect(declarator.declare(content, options)).toEqual(
      "import { Module } from '@nestjs/common';\n" +
        "import { Foo } from './foo';\n" +
        '\n' +
        '@Module({})\n' +
        'export class FooModule {}\n',
    );
  });

  it('should not break existing multi-line imports', () => {
    const content: string =
      'import {\n' +
      '  Module,\n' +
      '  Helper,\n' +
      "} from '@nestjs/common';\n" +
      '\n' +
      '@Helper()\n' +
      '@Module({})\n' +
      'export class FooModule {}\n';

    const options: DeclarationOptions = {
      metadata: 'imports',
      type: 'module',
      name: 'bar',
      path: normalize('/src/foo/bar'),
      module: normalize('/src/foo/foo.module.ts'),
      symbol: 'BarModule',
    };
    const declarator = new ModuleImportDeclarator();
    expect(declarator.declare(content, options)).toEqual(
      'import {\n' +
        '  Module,\n' +
        '  Helper,\n' +
        "} from '@nestjs/common';\n" +
        "import { BarModule } from './bar/bar.module';\n" +
        '\n' +
        '@Helper()\n' +
        '@Module({})\n' +
        'export class FooModule {}\n',
    );
  });

  it('should append .js extension for providers when isEsm is true', () => {
    const content: string =
      "import { Module } from '@nestjs/common';\n" +
      '\n' +
      '@Module({})\n' +
      'export class FooModule {}\n';
    const options: DeclarationOptions = {
      metadata: 'providers',
      name: 'foo',
      path: normalize('/src/foo'),
      module: normalize('/src/foo/foo.ts'),
      symbol: 'Foo',
      isEsm: true,
    };
    const declarator = new ModuleImportDeclarator();
    expect(declarator.declare(content, options)).toEqual(
      "import { Module } from '@nestjs/common';\n" +
        "import { Foo } from './foo.js';\n" +
        '\n' +
        '@Module({})\n' +
        'export class FooModule {}\n',
    );
  });

  it('should append .js extension for module imports when isEsm is true', () => {
    const content: string =
      "import { Module } from '@nestjs/common';\n" +
      '\n' +
      '@Module({})\n' +
      'export class FooModule {}\n';
    const options: DeclarationOptions = {
      metadata: 'imports',
      type: 'module',
      name: 'bar',
      path: normalize('/src/foo/bar'),
      module: normalize('/src/foo/foo.module.ts'),
      symbol: 'BarModule',
      isEsm: true,
    };
    const declarator = new ModuleImportDeclarator();
    expect(declarator.declare(content, options)).toEqual(
      "import { Module } from '@nestjs/common';\n" +
        "import { BarModule } from './bar/bar.module.js';\n" +
        '\n' +
        '@Module({})\n' +
        'export class FooModule {}\n',
    );
  });

  describe('when the symbol is already imported', () => {
    const options: DeclarationOptions = {
      metadata: 'providers',
      type: 'service',
      name: 'users',
      path: normalize('/src/users'),
      module: normalize('/src/app.module.ts'),
      symbol: 'UsersService',
    };
    const moduleBody =
      '\n' +
      '@Module({ providers: [UsersService] })\n' +
      'export class AppModule {}\n';

    it('should not duplicate the import', () => {
      const content: string =
        "import { Module } from '@nestjs/common';\n" +
        "import { UsersService } from './users/users.service';\n" +
        moduleBody;
      const declarator = new ModuleImportDeclarator();
      expect(declarator.declare(content, options)).toEqual(content);
    });

    it('should not duplicate a double-quoted import', () => {
      const content: string =
        'import { Module } from "@nestjs/common";\n' +
        'import { UsersService } from "./users/users.service";\n' +
        moduleBody;
      const declarator = new ModuleImportDeclarator();
      expect(declarator.declare(content, options)).toEqual(content);
    });

    it('should not duplicate a multi-symbol import', () => {
      const content: string =
        "import { Module } from '@nestjs/common';\n" +
        "import { USERS, UsersService } from './users/users.service';\n" +
        moduleBody;
      const declarator = new ModuleImportDeclarator();
      expect(declarator.declare(content, options)).toEqual(content);
    });

    it('should not duplicate the import when isEsm is true', () => {
      const content: string =
        "import { Module } from '@nestjs/common';\n" +
        "import { UsersService } from './users/users.service.js';\n" +
        moduleBody;
      const declarator = new ModuleImportDeclarator();
      expect(declarator.declare(content, { ...options, isEsm: true })).toEqual(
        content,
      );
    });

    it.each([false, true])(
      'should add the import when the symbol is aliased (isEsm: %s)',
      (isEsm) => {
        const path = `./users/users.service${isEsm ? '.js' : ''}`;
        const content =
          "import { Module } from '@nestjs/common';\n" +
          `import { UsersService as LegacyUsers } from '${path}';\n` +
          moduleBody;
        const declarator = new ModuleImportDeclarator();
        expect(declarator.declare(content, { ...options, isEsm })).toEqual(
          "import { Module } from '@nestjs/common';\n" +
            `import { UsersService as LegacyUsers } from '${path}';\n` +
            `import { UsersService } from '${path}';\n` +
            moduleBody,
        );
      },
    );

    it('should add the import when the alias is on the next line', () => {
      const imports =
        "import { Module } from '@nestjs/common';\n" +
        'import {\n' +
        '  UsersService\n' +
        '    as LegacyUsers,\n' +
        "} from './users/users.service';\n";
      const declarator = new ModuleImportDeclarator();
      expect(declarator.declare(imports + moduleBody, options)).toEqual(
        imports +
          "import { UsersService } from './users/users.service';\n" +
          moduleBody,
      );
    });

    it.each([
      'UsersService /* legacy */ as LegacyUsers',
      'UsersService // legacy\n as LegacyUsers',
      '/* UsersService */ AdminUsersService',
    ])('should add a value import for %s', (specifier) => {
      const imports =
        "import { Module } from '@nestjs/common';\n" +
        `import { ${specifier} } from './users/users.service';\n`;
      expect(
        new ModuleImportDeclarator().declare(imports + moduleBody, options),
      ).toEqual(
        imports +
          "import { UsersService } from './users/users.service';\n" +
          moduleBody,
      );
    });

    it.each([
      "import { UsersService as UsersService } from './users/users.service';",
      "import DefaultService, { UsersService } from './users/users.service';",
      "import /* keep */ { UsersService } /* keep */ from './users/users.service';",
      "import { UsersService as LegacyUsers, UsersService } from './users/users.service';",
    ])('should reuse an existing value binding: %s', (declaration) => {
      const content = declaration + '\n' + moduleBody;
      expect(new ModuleImportDeclarator().declare(content, options)).toEqual(
        content,
      );
    });

    it.each([
      [
        "import { type UsersService } from './users/users.service';",
        "import { UsersService } from './users/users.service';",
      ],
      [
        "import { type /* keep */ UsersService, type UserOptions } from './users/users.service';",
        "import { /* keep */ UsersService, type UserOptions } from './users/users.service';",
      ],
      [
        "import type { UsersService } from './users/users.service';",
        "import { UsersService } from './users/users.service';",
      ],
      [
        "import type /* keep */ { UsersService, UserOptions as Options } from './users/users.service';",
        "import /* keep */ { UsersService, type UserOptions as Options } from './users/users.service';",
      ],
      [
        "import type { UserOptions, UsersService as UsersService } from './users/users.service';",
        "import { type UserOptions, UsersService as UsersService } from './users/users.service';",
      ],
      [
        "import type { UsersService, UserOptions } from './users/users.service' with { /* mode note */ 'resolution-mode': 'require' };",
        "import { UsersService, type UserOptions } from './users/users.service' /* mode note */;",
      ],
      [
        "import type { UsersService } from './users/users.service' with { 'resolution-mode': 'import' };",
        "import { UsersService } from './users/users.service';",
      ],
      [
        "import type { UsersService } from './users/users.service' with { // mode note\n 'resolution-mode': 'require' };",
        "import { UsersService } from './users/users.service' // mode note\n;",
      ],
    ])('should promote only the required type import: %s', (before, after) => {
      const declarator = new ModuleImportDeclarator();
      const output = declarator.declare(before + '\n' + moduleBody, options);
      expect(output).toEqual(after + '\n' + moduleBody);
      expect(declarator.declare(output, options)).toEqual(output);
    });

    it('should preserve a type-only alias when adding the value import', () => {
      const imports =
        "import type { UsersService as LegacyUsers } from './users/users.service';\n";
      expect(
        new ModuleImportDeclarator().declare(imports + moduleBody, options),
      ).toEqual(
        imports +
          "import { UsersService } from './users/users.service';\n" +
          moduleBody,
      );
    });

    it.each([
      "/*\nimport { UsersService } from './users/users.service';\n*/\n",
      "const example = `\nimport { UsersService } from './users/users.service';\n`;\n",
    ])('should ignore import text outside declarations: %s', (example) => {
      const imports = "import { Module } from '@nestjs/common';\n";
      expect(
        new ModuleImportDeclarator().declare(
          imports + example + moduleBody,
          options,
        ),
      ).toEqual(
        imports +
          "import { UsersService } from './users/users.service';\n" +
          example +
          moduleBody,
      );
    });

    it('should insert after a multiline import and its trailing comment', () => {
      const imports =
        "import { Module } from '@nestjs/common';\n" +
        'import { UsersService /* keep */ as LegacyUsers }\n' +
        "  from './users/users.service'; // keep this comment\n";
      expect(
        new ModuleImportDeclarator().declare(imports + moduleBody, options),
      ).toEqual(
        imports +
          "import { UsersService } from './users/users.service';\n" +
          moduleBody,
      );
    });

    it.each([
      "import { UsersService } from './legacy/users.service';",
      "import { AdminUsersService as UsersService } from './users/users.service';",
      "import UsersService from './users/users.service';",
      "import * as UsersService from './users/users.service';",
      "import UsersService = require('./legacy/users.service');",
    ])('should report an existing conflicting import: %s', (declaration) => {
      expect(() =>
        new ModuleImportDeclarator().declare(
          declaration + '\n' + moduleBody,
          options,
        ),
      ).toThrow(
        "Cannot import 'UsersService' from './users/users.service': the name is already bound by another import.",
      );
    });

    it('should still add the import for a similar symbol', () => {
      const content: string =
        "import { Module } from '@nestjs/common';\n" +
        "import { AdminUsersService } from './users/users.service';\n" +
        moduleBody;
      const declarator = new ModuleImportDeclarator();
      expect(declarator.declare(content, options)).toEqual(
        "import { Module } from '@nestjs/common';\n" +
          "import { AdminUsersService } from './users/users.service';\n" +
          "import { UsersService } from './users/users.service';\n" +
          moduleBody,
      );
    });

    it('should still add the import when another path imports the symbol with an alias', () => {
      const imports =
        "import { Module } from '@nestjs/common';\n" +
        "import { UsersService as LegacyUsers } from './legacy/users.service';\n";
      const declarator = new ModuleImportDeclarator();
      expect(declarator.declare(imports + moduleBody, options)).toEqual(
        imports +
          "import { UsersService } from './users/users.service';\n" +
          moduleBody,
      );
    });
  });

  it('should not break on match of "from" in another context', () => {
    const content: string =
      'import {\n' +
      '  Module,\n' +
      '  Helper,\n' +
      "} from '@nestjs/common';\n" +
      '\n' +
      '@Helper()\n' +
      '@Module({})\n' +
      'const x = " from ";\n' +
      'console.error(" from ");\n' +
      'export class FooModule {}\n';

    const options: DeclarationOptions = {
      metadata: 'imports',
      type: 'module',
      name: 'bar',
      path: normalize('/src/foo/bar'),
      module: normalize('/src/foo/foo.module.ts'),
      symbol: 'BarModule',
    };
    const declarator = new ModuleImportDeclarator();
    expect(declarator.declare(content, options)).toEqual(
      'import {\n' +
        '  Module,\n' +
        '  Helper,\n' +
        "} from '@nestjs/common';\n" +
        "import { BarModule } from './bar/bar.module';\n" +
        '\n' +
        '@Helper()\n' +
        '@Module({})\n' +
        'const x = " from ";\n' +
        'console.error(" from ");\n' +
        'export class FooModule {}\n',
    );
  });
});
