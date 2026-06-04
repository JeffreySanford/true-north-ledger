export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Angular standalone components in NgModule-based page code.',
      recommended: 'error',
    },
    schema: [],
    messages: {
      noStandalone: 'Standalone Angular components are not allowed in this repository. Use an NgModule-declared component instead.',
    },
  },
  create(context) {
    return {
      'Decorator[expression.callee.name="Component"]'(node) {
        const callExpression = node.expression;
        if (!callExpression || callExpression.type !== 'CallExpression') {
          return;
        }

        const [arg] = callExpression.arguments;
        if (!arg || arg.type !== 'ObjectExpression') {
          return;
        }

        const standaloneProperty = arg.properties.find((property) => {
          if (property.type !== 'Property') {
            return false;
          }

          const key = property.key;
          if (key.type === 'Identifier') {
            return key.name === 'standalone';
          }

          return key.type === 'Literal' && key.value === 'standalone';
        });

        if (!standaloneProperty || standaloneProperty.type !== 'Property') {
          return;
        }

        const value = standaloneProperty.value;
        if (value.type === 'Literal' && value.value === true) {
          context.report({ node: standaloneProperty.key, messageId: 'noStandalone' });
        }
      },
    };
  },
};
