// Money is never a JS number: decimal strings in JSON, decimal.js in code (multi-currency.md).
// Heuristic, name-based rule: flags number conversions and float literals applied to values whose
// names look like money (amount, balance, price, ...).

const DEFAULT_PATTERN = '(amount|balance|price|total|money|cost|fee|budget|spent|income|expense)';

/** @param {import('estree').Node} node @returns {string | undefined} */
function nameOf(node) {
  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'MemberExpression':
      return !node.computed && node.property.type === 'Identifier' ? node.property.name : undefined;
    case 'ChainExpression':
      return nameOf(node.expression);
    case 'CallExpression':
      return nameOf(node.callee);
    case 'TSNonNullExpression':
    case 'TSAsExpression':
      return nameOf(node.expression);
    default:
      return undefined;
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow converting money values to JS floats' },
    messages: {
      conversion:
        '`{{fn}}` turns the money value `{{name}}` into a float. Use `parseDecimal`/`money()` from @monevo/domain.',
      toFixed:
        '`.toFixed()` on `{{name}}` implies float money. Use `roundToCurrency`/`moneyToDecimalString` from @monevo/domain.',
      literal:
        'Money value `{{name}}` assigned a float literal. Use a decimal string such as "{{raw}}".',
    },
    schema: [
      {
        type: 'object',
        properties: { namePattern: { type: 'string' } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const pattern = new RegExp(context.options[0]?.namePattern ?? DEFAULT_PATTERN, 'i');
    /** @param {import('estree').Node | undefined} node */
    const moneyName = (node) => {
      if (!node) return undefined;
      const name = nameOf(node);
      return name !== undefined && pattern.test(name) ? name : undefined;
    };
    /** @param {import('estree').Node} node */
    const isFloatLiteral = (node) =>
      node.type === 'Literal' && typeof node.value === 'number' && !Number.isInteger(node.value);

    return {
      CallExpression(node) {
        const callee = node.callee;
        let fn;
        if (callee.type === 'Identifier' && ['parseFloat', 'Number'].includes(callee.name))
          fn = callee.name;
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Number' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'parseFloat'
        ) {
          fn = 'Number.parseFloat';
        }
        if (fn) {
          const name = moneyName(node.arguments[0]);
          if (name) context.report({ node, messageId: 'conversion', data: { fn, name } });
          return;
        }
        if (
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'toFixed'
        ) {
          const name = moneyName(callee.object);
          if (name) context.report({ node, messageId: 'toFixed', data: { name } });
        }
      },
      UnaryExpression(node) {
        if (node.operator !== '+') return;
        const name = moneyName(node.argument);
        if (name) context.report({ node, messageId: 'conversion', data: { fn: 'unary +', name } });
      },
      VariableDeclarator(node) {
        if (node.init && isFloatLiteral(node.init)) {
          const name = moneyName(node.id);
          if (name)
            context.report({
              node: node.init,
              messageId: 'literal',
              data: { name, raw: node.init.raw },
            });
        }
      },
      Property(node) {
        if (isFloatLiteral(node.value) && !node.computed) {
          const name = moneyName(node.key);
          if (name)
            context.report({
              node: node.value,
              messageId: 'literal',
              data: { name, raw: node.value.raw },
            });
        }
      },
      AssignmentExpression(node) {
        if (isFloatLiteral(node.right)) {
          const name = moneyName(node.left);
          if (name)
            context.report({
              node: node.right,
              messageId: 'literal',
              data: { name, raw: node.right.raw },
            });
        }
      },
    };
  },
};

export default rule;
