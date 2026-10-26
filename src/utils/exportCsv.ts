import type { BudgetCode, Transaction } from '../types';

function csvField(value: string | number): string {
  let text = String(value);
  // Prevent spreadsheet formula execution from user-controlled memo/category text.
  if (typeof value === 'string' && /^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function transactionsToCsv(transactions: Transaction[], budgetCodes: BudgetCode[]): string {
  const categories = new Map(budgetCodes.map(code => [code.codeId, code.categoryName]));
  const typeNames = {INCOME: '수입', EXPENSE: '지출', SAVING: '저축'} as const;
  const sorted = [...transactions].sort((left, right) => left.txDate.localeCompare(right.txDate) || left.txId.localeCompare(right.txId));
  const rows = [
    ['날짜', '구분', '카테고리', '금액', '메모'],
    ...sorted.map(transaction => [
      transaction.txDate,
      typeNames[transaction.type],
      categories.get(transaction.codeId) ?? (transaction.codeId === 'INCOME' ? '수입' : transaction.codeId === 'SAVING' ? '저축' : `미분류 (${transaction.codeId})`),
      transaction.amount,
      transaction.memo,
    ]),
  ];
  return `\uFEFF${rows.map(row => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

export function downloadTransactionsCsv(transactions: Transaction[], budgetCodes: BudgetCode[], date = new Date()): void {
  const csv = transactionsToCsv(transactions, budgetCodes);
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;link.download = `가계부백업_${stamp}.csv`;
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
