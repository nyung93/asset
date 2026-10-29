import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recurringDueDate,recurringMonthSummary} from './recurringExpenses';

test('monthly due dates use the last day in short and leap-year months',()=>{
  assert.equal(recurringDueDate('2024-02',31),'2024-02-29');
  assert.equal(recurringDueDate('2025-02',31),'2025-02-28');
  assert.equal(recurringDueDate('2025-04',31),'2025-04-30');
  assert.equal(recurringDueDate('2025-12',31),'2025-12-31');
  assert.throws(()=>recurringDueDate('2025-13',31));
  assert.throws(()=>recurringDueDate('2025-02',0));
});

test('monthly paid totals only count payments for that expense and month',()=>{
  const expenses=[
    {id:'rent',name:'월세',day:31,amount:500000,codeId:'HO01',startMonth:'2025-01'},
    {id:'phone',name:'통신비',day:4,amount:50000,codeId:'HO01',startMonth:'2025-03'},
  ];
  const payments=[{expenseId:'rent',yearMonth:'2025-02',paidOn:'2025-02-28'},{expenseId:'phone',yearMonth:'2025-03',paidOn:'2025-03-04'}];
  assert.deepEqual(recurringMonthSummary(expenses,payments,'2025-02').rows.map(row=>row.id),['rent']);
  const march=recurringMonthSummary(expenses,payments,'2025-03');
  assert.deepEqual(march.rows.map(row=>row.id),['phone','rent']);
  assert.deepEqual([march.total,march.paid,march.remaining],[550000,50000,500000]);
});
