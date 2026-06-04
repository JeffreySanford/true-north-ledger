import nx from '@nx/eslint-plugin';
import standalonePlugin from './eslint-plugin-standalone.mjs';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    plugins: {
      standalone: standalonePlugin,
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'rxjs',
              importNames: ['firstValueFrom', 'lastValueFrom'],
              message:
                'Expose and test Observable streams directly. Promise conversion requires an explicit architecture exception.',
            },
          ],
        },
      ],
      'standalone/require-standalone-false': 'error',
    },
  },
  {
    files: ['apps/ledger-api/src/app/**/*.ts'],
    ignores: ['**/*.spec.ts', 'apps/ledger-api/src/app/migrations/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration[async=true]',
          message:
            'Avoid async methods in backend application code. Use cold Observable<T> return types and isolate Promise-based boundaries explicitly.',
        },
        {
          selector: 'MethodDefinition[kind="method"][value.async=true]',
          message:
            'Avoid async methods in backend application code. Use cold Observable<T> return types and isolate Promise-based boundaries explicitly.',
        },
      ],
    },
  },
];
