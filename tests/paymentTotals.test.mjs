import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const { code } = await transform(await readFile('src/services/financialAccounting.ts', 'utf8'), { loader: 'ts', format: 'esm' });
const { calculateApartmentFinancials: apartmentTotals, calculateBuildingFinancials: buildingTotals } =
  await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const apartment = { id: 'a', buildingId: 'b', monthlyFee: 100, overdueMonths: 0, paidAmount: 2000, creditBalance: 1900, lastPaymentDate: '2026-11-09' };
const receipt = { id: 'p', apartmentId: 'a', amount: 2000, date: '2026-11-09', month: '2026-11' };

test('deleting the last receipt clears collected totals despite stale apartment summaries', () => {
  assert.equal(buildingTotals('b', [apartment], [receipt]).totalCollected, 2000);
  const after = apartmentTotals(apartment, []);
  assert.equal(after.totalPaid, 0);
  assert.equal(after.creditBalance, 0);
  assert.equal(after.lastPaymentDate, undefined);
  assert.equal(after.remaining, 100);
  assert.equal(buildingTotals('b', [apartment], []).totalCollected, 0);
});

test('deleting one receipt keeps other units and remaining receipts in the total', () => {
  const other = { ...apartment, id: 'other', paidAmount: 500 };
  const remaining = [{ ...receipt, id: 'p2', amount: 40 }, { ...receipt, id: 'p3', apartmentId: 'other', amount: 60 }];
  assert.equal(apartmentTotals(apartment, remaining).totalPaid, 40);
  assert.equal(apartmentTotals(apartment, remaining).remaining, 60);
  assert.equal(buildingTotals('b', [apartment, other], remaining).totalCollected, 100);
});

test('empty periods and exceptional receipts do not restore old paid amounts', () => {
  assert.equal(apartmentTotals(apartment, [receipt], '2026-12').totalPaid, 0);
  assert.equal(apartmentTotals(apartment, [{ ...receipt, paymentType: 'exceptional' }]).totalPaid, 0);
});
