import type {BudgetCode, BudgetCodeKind} from '../types';

const prefixes: Record<BudgetCodeKind, string> = {
  EXPENSE: 'EX', INCOME: 'IN', SAVING: 'SA', INVESTMENT: 'IV',
};

/** Older saved categories had no kind; they were all expense budgets. */
export function codeKind(code: BudgetCode): BudgetCodeKind {
  return code.kind ?? 'EXPENSE';
}

export function nextCodeId(codes: BudgetCode[], kind: BudgetCodeKind): string {
  const used = new Set(codes.map(code => code.codeId));
  const prefix = prefixes[kind];
  for (let index = 1; index <= 999999; index++) {
    const candidate = `${prefix}${String(index).padStart(4, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('더 이상 카테고리를 추가할 수 없어요.');
}
