import { eq, sql } from 'drizzle-orm';
import {
  accounts,
  auditLogs,
  installments,
  ledgerEntries,
  sales,
  vouchers,
} from '../db/schema.ts';

export type DbTx = any;

export function roundMoney(val: number): number {
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
}

export function formatMoneyStr(val: number): string {
  return roundMoney(val).toFixed(2);
}

export async function getSystemAccountByCode(tx: DbTx, code: string) {
  const rows = await tx
    .select()
    .from(accounts)
    .where(eq(accounts.code, code))
    .limit(1);
  if (!rows[0]) {
    throw new Error(`Required system account ${code} not found in Chart of Accounts.`);
  }
  return rows[0];
}

export async function generateNextVoucherNumber(
  tx: DbTx,
  prefix: string,
  yearStr?: string
): Promise<string> {
  const yr = yearStr || new Date().getFullYear().toString();
  const pattern = `${prefix}-${yr}-%`;
  const existing = await tx
    .select({ voucherNumber: vouchers.voucherNumber })
    .from(vouchers)
    .where(sql`${vouchers.voucherNumber} LIKE ${pattern}`);

  let maxSeq = 0;
  for (const row of existing) {
    const parts = row.voucherNumber.split('-');
    const seq = parseInt(parts[parts.length - 1] || '0', 10);
    if (!Number.isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  return `${prefix}-${yr}-${String(maxSeq + 1).padStart(4, '0')}`;
}

export async function generateNextInvoiceNumber(
  tx: DbTx,
  prefix: string
): Promise<string> {
  const yr = new Date().getFullYear().toString();
  const pattern = `${prefix}-${yr}-%`;
  const existing = await tx
    .select({ invoiceNumber: sales.invoiceNumber })
    .from(sales)
    .where(sql`${sales.invoiceNumber} LIKE ${pattern}`);

  let maxSeq = 0;
  for (const row of existing) {
    const parts = row.invoiceNumber.split('-');
    const seq = parseInt(parts[parts.length - 1] || '0', 10);
    if (!Number.isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  return `${prefix}-${yr}-${String(maxSeq + 1).padStart(4, '0')}`;
}

export interface VoucherLineInput {
  accountId: number;
  debit: number;
  credit: number;
  narration?: string;
  customerId?: number | null;
  propertyId?: number | null;
  saleId?: number | null;
  installmentId?: number | null;
}

export interface PostVoucherParams {
  voucherNumber: string;
  voucherType: 'CRV' | 'CPV' | 'JV' | 'SALE' | 'REVERSAL';
  voucherDate: string;
  customerId?: number | null;
  propertyId?: number | null;
  saleId?: number | null;
  cashBankAccountId?: number | null;
  partyName?: string;
  receiptCategory?: string;
  paymentMethod?: string;
  referenceNo?: string;
  narration: string;
  createdByUid: string;
  approvedByUid?: string | null;
  reversedVoucherId?: number | null;
  lines: VoucherLineInput[];
}

export async function postBalancedVoucher(tx: DbTx, params: PostVoucherParams) {
  if (!params.lines || params.lines.length < 2) {
    throw new Error('Double-entry voucher requires at least 2 ledger lines.');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of params.lines) {
    const d = roundMoney(line.debit);
    const c = roundMoney(line.credit);
    if (d < 0 || c < 0) {
      throw new Error('Ledger debit and credit amounts cannot be negative.');
    }
    if (d === 0 && c === 0) {
      throw new Error('Ledger line cannot have both zero debit and zero credit.');
    }
    if (d > 0 && c > 0) {
      throw new Error('A single ledger line cannot have both debit and credit values.');
    }
    totalDebit = roundMoney(totalDebit + d);
    totalCredit = roundMoney(totalCredit + c);
  }

  if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(
      `Unbalanced voucher rejected: Debit (${totalDebit.toFixed(2)}) must equal Credit (${totalCredit.toFixed(2)}).`
    );
  }

  const [createdVoucher] = await tx
    .insert(vouchers)
    .values({
      voucherNumber: params.voucherNumber,
      voucherType: params.voucherType,
      voucherDate: params.voucherDate,
      customerId: params.customerId ?? null,
      propertyId: params.propertyId ?? null,
      saleId: params.saleId ?? null,
      cashBankAccountId: params.cashBankAccountId ?? null,
      partyName: params.partyName || '',
      receiptCategory: params.receiptCategory || '',
      paymentMethod: params.paymentMethod || 'Cash',
      referenceNo: params.referenceNo || '',
      totalAmount: formatMoneyStr(totalDebit),
      narration: params.narration,
      status: 'Posted',
      reversedVoucherId: params.reversedVoucherId ?? null,
      createdByUid: params.createdByUid,
      approvedByUid: params.approvedByUid ?? params.createdByUid,
    })
    .returning();

  for (const line of params.lines) {
    await tx.insert(ledgerEntries).values({
      voucherId: createdVoucher.id,
      entryDate: params.voucherDate,
      accountId: line.accountId,
      customerId: line.customerId ?? params.customerId ?? null,
      propertyId: line.propertyId ?? params.propertyId ?? null,
      saleId: line.saleId ?? params.saleId ?? null,
      installmentId: line.installmentId ?? null,
      debit: formatMoneyStr(line.debit),
      credit: formatMoneyStr(line.credit),
      narration: line.narration || params.narration,
    });
  }

  return createdVoucher;
}

export async function logAudit(
  tx: DbTx,
  userUid: string | null,
  userEmail: string | null,
  action: string,
  entityType: string,
  entityId: string | number,
  details: string
) {
  await tx.insert(auditLogs).values({
    userUid,
    userEmail,
    action,
    entityType,
    entityId: String(entityId),
    details,
  });
}

export function addMonthsToDate(dateStr: string, monthsToAdd: number, targetDay?: number): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const baseDate = new Date(Date.UTC(y, m - 1 + monthsToAdd, 1));
  const lastDayOfMonth = new Date(
    Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(targetDay || d || 10, lastDayOfMonth);
  const year = baseDate.getUTCFullYear();
  const month = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

export async function syncInstallmentStatuses(tx: DbTx) {
  const today = new Date().toISOString().slice(0, 10);
  const allActive = await tx
    .select()
    .from(installments)
    .where(sql`${installments.status} IN ('Upcoming', 'Due', 'Partially Paid', 'Overdue')`);

  for (const inst of allActive) {
    const rem = Number(inst.remainingAmount);
    const paid = Number(inst.paidAmount);
    let nextStatus = inst.status;
    if (rem <= 0.005) {
      nextStatus = 'Paid';
    } else if (inst.dueDate < today) {
      nextStatus = 'Overdue';
    } else if (paid > 0) {
      nextStatus = 'Partially Paid';
    } else if (inst.dueDate === today) {
      nextStatus = 'Due';
    } else {
      nextStatus = 'Upcoming';
    }
    if (nextStatus !== inst.status) {
      await tx
        .update(installments)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(installments.id, inst.id));
    }
  }
}
