// Owned data is reached only through user-scoped repositories (*.repo.ts)
// (authorization-and-data-isolation.md). Prisma model access anywhere else is reported, except for
// instance-wide tables without an owner (allowModels). `$`-prefixed client methods are not models.

const DEFAULT_ALLOW = ['appSetting', 'currency'];
const CLIENT_NAMES = new Set(['prisma', 'tx']);

/** @param {import('estree').Node} node */
function isPrismaClient(node) {
  if (node.type === 'Identifier') return CLIENT_NAMES.has(node.name);
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return node.property.name === 'prisma';
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow Prisma model access outside *.repo.ts files' },
    messages: {
      unscoped: 'Prisma model `{{model}}` accessed outside a repository. Use the module\'s user-scoped `*.repo.ts`.',
    },
    schema: [
      {
        type: 'object',
        properties: { allowModels: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    if (/\.repo\.[cm]?[jt]s$/.test(context.filename)) return {};
    const allowed = new Set(context.options[0]?.allowModels ?? DEFAULT_ALLOW);
    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== 'Identifier') return;
        const model = node.property.name;
        if (model.startsWith('$') || model.startsWith('_') || allowed.has(model)) return;
        if (!isPrismaClient(node.object)) return;
        // Only `client.model.method(...)` is model access; `client.model` alone could be anything.
        const parent = node.parent;
        if (parent?.type === 'MemberExpression' && parent.object === node) {
          context.report({ node, messageId: 'unscoped', data: { model } });
        }
      },
    };
  },
};

export default rule;
