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

const charge = { ...receipt, id: 'charge', amount: 2000, paymentType: 'exceptional', isAssessment: true };
const partial = { ...receipt, id: 'partial', amount: 500, paymentType: 'exceptional', exceptionalChargeId: 'charge' };
test('exceptional assessment creates a receivable, never collected cash or an advance credit', () => {
  const fin = buildingTotals('b', [apartment], [charge]);
  assert.equal(fin.totalExpectedDues, 2100);
  assert.equal(fin.totalCollected, 0);
  assert.equal(fin.totalRemaining, 2100);
  assert.equal(fin.totalCreditBalance, 0);
  assert.equal(apartmentTotals(apartment, [charge]).allPayments.length, 0);
});
test('partial exceptional payment settles only its assessment and appears in collected cash', () => {
  const fin = apartmentTotals(apartment, [charge, partial]);
  assert.equal(fin.totalPaid, 500);
  assert.equal(fin.remaining, 1600);
  assert.equal(fin.creditBalance, 0);
  assert.equal(fin.allPayments.length, 1);
  assert.equal(buildingTotals('b', [apartment], [charge, partial]).totalCollected, 500);
});
test('monthly advance credit never masks an unpaid exceptional assessment', () => {
  const fin = apartmentTotals(apartment, [charge, receipt, partial]);
  assert.equal(fin.remaining, 1500);
  assert.equal(fin.creditBalance, 1900);
});
test('editing and deleting exceptional receipts recomputes its unpaid balance', () => {
  assert.equal(apartmentTotals(apartment, [charge, { ...partial, amount: 1000 }]).remaining, 1100);
  assert.equal(apartmentTotals(apartment, [charge]).remaining, 2100);
});
test('exceptional payments cannot settle a different assessment or apartment', () => {
  const otherCharge = { ...charge, id: 'other-charge', amount: 700 };
  const otherReceipt = { ...partial, apartmentId: 'another' };
  assert.equal(apartmentTotals(apartment, [charge, otherCharge, partial, otherReceipt]).remaining, 2300);
});

test('deleting an unpaid exceptional assessment clears only its receivable', () => {
  const fin = buildingTotals('b', [apartment], [{ ...charge, assessmentCancelled: true }]);
  assert.equal(fin.totalRemaining, 100);
  assert.equal(fin.totalCollected, 0);
  assert.equal(fin.totalExpectedDues, 100);
});
test('deleting a partially paid assessment preserves its cash and the monthly dues', () => {
  const cancelled = { ...charge, assessmentCancelled: true };
  const fin = apartmentTotals(apartment, [cancelled, partial]);
  assert.equal(fin.remaining, 100);
  assert.equal(fin.totalPaid, 500);
  assert.equal(fin.totalDue, 600);
  assert.equal(fin.creditBalance, 0);
  assert.equal(fin.allPayments.length, 1);
  assert.equal(apartmentTotals(apartment, [cancelled]).remaining, 100);
});
test('cancelling one assessment leaves other assessments and monthly advance credits intact', () => {
  const rows = [{ ...charge, assessmentCancelled: true }, partial, { ...charge, id: 'charge-2', amount: 700 }, receipt];
  const fin = apartmentTotals(apartment, rows);
  assert.equal(fin.remaining, 700);
  assert.equal(fin.creditBalance, 1900);
  assert.equal(fin.totalPaid, 2500);
});
