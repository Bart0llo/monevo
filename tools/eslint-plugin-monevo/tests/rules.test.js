import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import plugin from '../index.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser, ecmaVersion: 2024, sourceType: 'module' } });

tester.run('no-ambient-time', plugin.rules['no-ambient-time'], {
  valid: [
    'const d = new Date(clock.now().getTime());',
    "const d = new Date('2026-11-18T00:00:00Z');",
    'const n = clock.now();',
    'const t = performance.now();',
    'const n = obj.Date.now;',
  ],
  invalid: [
    { code: 'const d = new Date();', errors: [{ messageId: 'newDate' }] },
    { code: 'const n = Date.now();', errors: [{ messageId: 'dateNow' }] },
  ],
});

tester.run('no-float-money', plugin.rules['no-float-money'], {
  valid: [
    'const amount = parseDecimal(input.amount);',
    "const amount = '12.50';",
    'const count = Number(input.count);',
    'const ratio = 0.5;',
    'const x = parseFloat(input.width);',
    'const totalItems = 3;',
    'const v = +input.page;',
    { code: 'const n = Number(x.amount);', options: [{ namePattern: '^nothing$' }] },
  ],
  invalid: [
    { code: 'const n = parseFloat(input.amount);', errors: [{ messageId: 'conversion' }] },
    { code: 'const n = Number(balance);', errors: [{ messageId: 'conversion' }] },
    { code: 'const n = Number.parseFloat(row.price);', errors: [{ messageId: 'conversion' }] },
    { code: 'const n = +posting.amount;', errors: [{ messageId: 'conversion' }] },
    { code: 'const s = total.toFixed(2);', errors: [{ messageId: 'toFixed' }] },
    { code: 'const s = getAmount().toFixed(2);', errors: [{ messageId: 'toFixed' }] },
    { code: 'const amount = 12.5;', errors: [{ messageId: 'literal' }] },
    { code: 'const dto = { amount: 9.99 };', errors: [{ messageId: 'literal' }] },
    { code: 'tx.fee = 0.3;', errors: [{ messageId: 'literal' }] },
  ],
});

tester.run('no-unscoped-prisma', plugin.rules['no-unscoped-prisma'], {
  valid: [
    { code: 'await prisma.transaction.findMany({ where: { userId } });', filename: '/app/src/modules/transactions/transactions.repo.ts' },
    { code: 'await prisma.appSetting.findMany();', filename: '/app/src/config/settings.ts' },
    { code: 'await prisma.currency.findMany();', filename: '/app/src/modules/currencies/currencies.service.ts' },
    { code: 'await prisma.$queryRaw`SELECT 1`;', filename: '/app/src/infra/database.ts' },
    { code: 'await prisma.$disconnect();', filename: '/app/src/main.ts' },
    { code: 'const x = this.transaction.findMany();', filename: '/app/src/a.ts' },
    { code: 'const t = deps.prisma;', filename: '/app/src/a.ts' },
  ],
  invalid: [
    {
      code: 'await prisma.transaction.findMany();',
      filename: '/app/src/modules/transactions/transactions.service.ts',
      errors: [{ messageId: 'unscoped', data: { model: 'transaction' } }],
    },
    { code: 'await tx.account.update({});', filename: '/app/src/x.ts', errors: [{ messageId: 'unscoped' }] },
    { code: 'await this.deps.prisma.user.findFirst();', filename: '/app/src/x.ts', errors: [{ messageId: 'unscoped' }] },
    {
      code: 'await prisma.appSetting.findMany();',
      filename: '/app/src/x.ts',
      options: [{ allowModels: [] }],
      errors: [{ messageId: 'unscoped' }],
    },
  ],
});
