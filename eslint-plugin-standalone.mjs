import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator((name) => `https://example.com/rule/${name}`);

const requireStandaloneFalseRule = createRule({
  name: 'require-standalone-false',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure Angular components and directives explicitly set standalone: false.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      missingStandalone: 'Angular {{type}} must specify standalone: false in the decorator metadata.',
      invalidStandalone: 'Angular {{type}} must set standalone: false, not {{value}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ClassDeclaration(node) {
        const decorators = node.decorators ?? [];
        if (!decorators.length) {
          return;
        }

        for (const decorator of decorators) {
          if (decorator.expression.type !== 'CallExpression') {
            continue;
          }

          const callExpr = decorator.expression;
          const callee = callExpr.callee;
          const decoratorName =
            callee.type === 'Identifier'
              ? callee.name
              : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : null;

          if (decoratorName !== 'Component' && decoratorName !== 'Directive') {
            continue;
          }

          const decoratorType = decoratorName.toLowerCase();
          const firstArg = callExpr.arguments[0];
          if (!firstArg || firstArg.type !== 'ObjectExpression') {
            context.report({
              node: decorator,
              messageId: 'missingStandalone',
              data: { type: decoratorType },
            });
            continue;
          }

          const standaloneProp = firstArg.properties.find((property) => {
            if (property.type !== 'Property') {
              return false;
            }
            const key = property.key;
            if (key.type === 'Identifier') {
              return key.name === 'standalone';
            }
            if (key.type === 'Literal' && typeof key.value === 'string') {
              return key.value === 'standalone';
            }
            return false;
          });

          if (!standaloneProp || standaloneProp.type !== 'Property') {
            context.report({
              node: decorator,
              messageId: 'missingStandalone',
              data: { type: decoratorType },
            });
            continue;
          }

          const value = standaloneProp.value;
          if (value.type !== 'Literal' || value.value !== false) {
            const displayValue = value.type === 'Literal' ? String(value.value) : context.getSourceCode().getText(value);
            context.report({
              node: standaloneProp,
              messageId: 'invalidStandalone',
              data: { type: decoratorType, value: displayValue },
            });
          }
        }
      },
    };
  },
});

export default {
  rules: {
    'require-standalone-false': requireStandaloneFalseRule,
  },
};
