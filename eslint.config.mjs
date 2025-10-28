import { defineConfig } from 'eslint/config';
import checkFile from 'eslint-plugin-check-file';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = path.dirname(currentFilename);
const compat = new FlatCompat({
  baseDirectory: currentDirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    ignores: ['node_modules/**', 'dist/**'],
  },
  {
    extends: compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/eslint-recommended',
      'plugin:@typescript-eslint/recommended',
      'prettier',
    ),

    plugins: {
      'check-file': checkFile,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 6,
      sourceType: 'commonjs',
    },

    rules: {
      'check-file/folder-naming-convention': [
        'error',
        {
          'src/**/': 'KEBAB_CASE',
          'test/lib/**/': 'KEBAB_CASE',
          'test/unit/**/': 'KEBAB_CASE',
        },
      ],

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase', 'UPPER_CASE'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
        },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
      ],

      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-prototype-builtins': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-var-requires': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      'no-buffer-constructor': 'error',
      'no-import-assign': 'error',
    },
  },

  {
    files: [
      'src/lib/source-handlers/**',
      'src/**/types.ts',
      'src/lib/**/types.ts',
    ],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Test-specific config (flat config uses separate entries instead of overrides)
  {
    files: ['test/**', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      // test fixtures frequently use kebab-case keys and require() imports
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
    {
      files: ['eslint.config.mjs'],
      languageOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
      rules: {
        'check-file/folder-naming-convention': 'off',
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ]);
