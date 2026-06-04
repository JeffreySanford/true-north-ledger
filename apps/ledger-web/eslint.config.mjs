import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import noStandaloneComponent from '../../eslint-rules/no-standalone-component.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    plugins: {
      tnl: {
        rules: {
          'no-standalone-component': noStandaloneComponent,
        },
      },
    },
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
      // Disable standalone component encouragement and enforce NgModule pages.
      '@angular-eslint/prefer-standalone': 'off',
      '@angular-eslint/prefer-inject': 'warn',
      'tnl/no-standalone-component': 'error',
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
