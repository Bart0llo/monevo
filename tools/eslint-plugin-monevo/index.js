// Monevo's custom lint rules (coding-conventions.md, implementation-stages.md#stage-1-foundation).
import noAmbientTime from './rules/no-ambient-time.js';
import noFloatMoney from './rules/no-float-money.js';
import noUnscopedPrisma from './rules/no-unscoped-prisma.js';

const plugin = {
  meta: { name: '@monevo/eslint-plugin', version: '0.1.0' },
  rules: {
    'no-ambient-time': noAmbientTime,
    'no-float-money': noFloatMoney,
    'no-unscoped-prisma': noUnscopedPrisma,
  },
};

export default plugin;
