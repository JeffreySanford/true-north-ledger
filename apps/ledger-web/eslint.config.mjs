import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'tnl',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'tnl',
          style: 'kebab-case',
        },
      ],
      // Downgrade Angular best practice rules to warnings for Sprint 0
      '@angular-eslint/prefer-standalone': 'warn',
      '@angular-eslint/prefer-inject': 'warn',
    },
  },
  {
    files: ['**/*.html'],
    rules: {
      // Downgrade template best practice rules to warnings for Sprint 0
      '@angular-eslint/template/prefer-control-flow': 'warn',
    },
  },
  {
    // Override or add rules here
    rules: {},
  },
];
