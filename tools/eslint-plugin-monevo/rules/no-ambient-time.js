// Time is always injected (`Clock`), so tests are deterministic (coding-conventions.md#3-dates-and-time).
// Allowed only in infra/clock.ts and tests, which the ESLint config exempts by file pattern.

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow reading the wall clock outside the injected Clock' },
    messages: {
      newDate:
        'Zero-argument `new Date()` reads the wall clock. Use the injected `Clock` (`clock.now()`).',
      dateNow: '`Date.now()` reads the wall clock. Use the injected `Clock` (`clock.now()`).',
    },
    schema: [],
  },
  create(context) {
    return {
      NewExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Date' &&
          node.arguments.length === 0
        ) {
          context.report({ node, messageId: 'newDate' });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Date' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'now'
        ) {
          context.report({ node, messageId: 'dateNow' });
        }
      },
    };
  },
};

export default rule;
