import type {RecurringExpense, RecurringExpensePayment} from '../types';

export function validYearMonth(value:string):boolean {
  return /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value);
}

export function recurringDueDate(yearMonth:string,day:number):string {
  if(!validYearMonth(yearMonth) || !Number.isInteger(day) || day<1 || day>31) throw new Error('납부일을 확인해 주세요.');
  const [year,month]=yearMonth.split('-').map(Number);
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  return `${yearMonth}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}

export function recurringMonthSummary(expenses:RecurringExpense[],payments:RecurringExpensePayment[],yearMonth:string) {
  const rows=expenses.filter(item=>item.startMonth<=yearMonth).map(item=>({
    ...item,dueDate:recurringDueDate(yearMonth,item.day),
    payment:payments.find(payment=>payment.expenseId===item.id && payment.yearMonth===yearMonth),
  })).sort((a,b)=>a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  const total=rows.reduce((sum,item)=>sum+item.amount,0);
  const paid=rows.reduce((sum,item)=>sum+(item.payment ? item.amount : 0),0);
  return {rows,total,paid,remaining:total-paid};
}
