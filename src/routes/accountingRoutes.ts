import { Router } from 'express';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  accounts,
  companySettings,
  customers,
  installmentAllocations,
  installments,
  ledgerEntries,
  properties,
  sales,
  vouchers,
} from '../db/schema.ts';
import { requireRole, type AuthRequest } from '../middleware/auth.ts';
import {
  formatMoneyStr,
  generateNextVoucherNumber,
  getSystemAccountByCode,
  logAudit,
  postBalancedVoucher,
  roundMoney,
  syncInstallmentStatuses,
} from '../services/accounting.ts';

export const accountingRouter = Router();

// Chart of Accounts
accountingRouter.get('/accounts', async (_req: AuthRequest, res) => {
  try {
    const [accRows, ledgerRows, voucherRows] = await Promise.all([
      db.select().from(accounts).orderBy(asc(accounts.code)),
      db.select().from(ledgerEntries),
      db.select().from(vouchers),
    ]);

    const postedVoucherIds = new Set(
      voucherRows.filter((v) => v.status === 'Posted').map((v) => v.id)
    );

    const totals = new Map<number, { debit: number; credit: number }>();
    for (const le of ledgerRows) {
      if (!postedVoucherIds.has(le.voucherId)) continue;
      const prev = totals.get(le.accountId) || { debit: 0, credit: 0 };
      prev.debit = roundMoney(prev.debit + Number(le.debit));
      prev.credit = roundMoney(prev.credit + Number(le.credit));
      totals.set(le.accountId, prev);
    }

    const enriched = accRows.map((a) => {
      const t = totals.get(a.id) || { debit: 0, credit: 0 };
      const opening = Number(a.openingBalance);
      const netBalance =
        a.normalBalance === 'DEBIT'
          ? roundMoney(opening + t.debit - t.credit)
          : roundMoney(opening + t.credit - t.debit);
      return {
        ...a,
        totalDebit: t.debit,
        totalCredit: t.credit,
        currentBalance: netBalance,
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Fetch accounts error:', error);
    res.status(500).json({ error: 'Failed to load chart of accounts' });
  }
});

accountingRouter.post(
  '/accounts',
  requireRole(['admin', 'accounts']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      if (!b.code || !b.name || !b.accountType || !b.normalBalance) {
        return res.status(400).json({
          error: 'Account code, name, type, and normal balance are required.',
        });
      }

      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(accounts)
          .values({
            code: String(b.code).trim(),
            name: String(b.name).trim(),
            parentId: b.parentId ? Number(b.parentId) : null,
            accountType: String(b.accountType),
            normalBalance: String(b.normalBalance),
            openingBalance: formatMoneyStr(Number(b.openingBalance || 0)),
            isSystem: false,
            isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
          })
          .returning();

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CREATE_ACCOUNT',
          'account',
          row.id,
          `Added account ${row.code} - ${row.name}`
        );
        return row;
      });
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'Account code already exists.' });
      }
      console.error('Create account error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  }
);

accountingRouter.put(
  '/accounts/:id',
  requireRole(['admin', 'accounts']),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const b = req.body;
      const updated = await db.transaction(async (tx) => {
        const existing = await tx.select().from(accounts).where(eq(accounts.id, id)).limit(1);
        if (!existing[0]) throw new Error('NOT_FOUND');
        const cur = existing[0];
        const [row] = await tx
          .update(accounts)
          .set({
            name: b.name !== undefined ? String(b.name).trim() : cur.name,
            parentId: b.parentId !== undefined ? (b.parentId ? Number(b.parentId) : null) : cur.parentId,
            openingBalance:
              b.openingBalance !== undefined
                ? formatMoneyStr(Number(b.openingBalance))
                : cur.openingBalance,
            isActive: b.isActive !== undefined ? Boolean(b.isActive) : cur.isActive,
          })
          .where(eq(accounts.id, id))
          .returning();

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'UPDATE_ACCOUNT',
          'account',
          id,
          `Updated account ${row.code} - ${row.name}`
        );
        return row;
      });
      res.json(updated);
    } catch (error: any) {
      if (error.message === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Account not found' });
      }
      res.status(500).json({ error: 'Failed to update account' });
    }
  }
);

// Vouchers List & Detail
accountingRouter.get('/vouchers', async (req: AuthRequest, res) => {
  try {
    const typeFilter = req.query.type ? String(req.query.type) : null;
    const [vRows, custRows, propRows, saleRows, accRows, entryRows] = await Promise.all([
      db.select().from(vouchers).orderBy(desc(vouchers.id)),
      db.select().from(customers),
      db.select().from(properties),
      db.select().from(sales),
      db.select().from(accounts),
      db.select().from(ledgerEntries),
    ]);

    const custMap = new Map(custRows.map((c) => [c.id, c]));
    const propMap = new Map(propRows.map((p) => [p.id, p]));
    const saleMap = new Map(saleRows.map((s) => [s.id, s]));
    const accMap = new Map(accRows.map((a) => [a.id, a]));

    const entriesByVoucher = new Map<number, any[]>();
    for (const e of entryRows) {
      const list = entriesByVoucher.get(e.voucherId) || [];
      list.push({ ...e, account: accMap.get(e.accountId) || null });
      entriesByVoucher.set(e.voucherId, list);
    }

    const filtered = typeFilter
      ? vRows.filter((v) => v.voucherType === typeFilter)
      : vRows;

    const enriched = filtered.map((v) => ({
      ...v,
      customer: v.customerId ? custMap.get(v.customerId) || null : null,
      property: v.propertyId ? propMap.get(v.propertyId) || null : null,
      sale: v.saleId ? saleMap.get(v.saleId) || null : null,
      cashBankAccount: v.cashBankAccountId ? accMap.get(v.cashBankAccountId) || null : null,
      entries: entriesByVoucher.get(v.id) || [],
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Fetch vouchers error:', error);
    res.status(500).json({ error: 'Failed to fetch vouchers' });
  }
});

// Cash Receipt Voucher (CRV)
accountingRouter.post(
  '/vouchers/crv',
  requireRole(['admin', 'accounts', 'recovery']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const amountReceived = roundMoney(Number(b.amountReceived || 0));
      const lateFeeAmount = roundMoney(Number(b.lateFeeAmount || 0));
      const voucherDate = b.voucherDate || new Date().toISOString().slice(0, 10);
      const cashBankAccountId = Number(b.cashBankAccountId);
      const receiptCategory = String(b.receiptCategory || 'Installment');
      const customerId = b.customerId ? Number(b.customerId) : null;
      const saleId = b.saleId ? Number(b.saleId) : null;
      const selectedInstallmentIds: number[] = Array.isArray(b.installmentIds)
        ? b.installmentIds.map(Number)
        : [];

      if (amountReceived <= 0 || !cashBankAccountId) {
        return res.status(400).json({
          error: 'Amount received (> 0) and Cash/Bank Account are required.',
        });
      }

      const created = await db.transaction(async (tx) => {
        const settingsRows = await tx.select().from(companySettings).limit(1);
        const settings = settingsRows[0];
        const crvNumber = await generateNextVoucherNumber(
          tx,
          settings?.crvPrefix || 'CRV'
        );

        const receivableAcc = await getSystemAccountByCode(tx, '1400');
        const deferredRevAcc = await getSystemAccountByCode(tx, '2300');
        const lateFeeAcc = await getSystemAccountByCode(tx, '4300');
        const customerAdvAcc = await getSystemAccountByCode(tx, '2200');
        const otherIncomeAcc = await getSystemAccountByCode(tx, '4400');

        let custName = String(b.partyName || '').trim();
        let resolvedPropertyId: number | null = b.propertyId ? Number(b.propertyId) : null;
        let resolvedSale: any = null;
        let resolvedProp: any = null;

        if (customerId) {
          const cRows = await tx
            .select()
            .from(customers)
            .where(eq(customers.id, customerId))
            .limit(1);
          if (cRows[0]) custName = cRows[0].fullName;
        }

        if (saleId) {
          const sRows = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1);
          if (!sRows[0]) throw new Error('Linked sale invoice not found.');
          if (sRows[0].status === 'Cancelled') {
            throw new Error('Cannot receive payment against a cancelled sale.');
          }
          resolvedSale = sRows[0];
          const salePropId: number = resolvedSale.propertyId;
          resolvedPropertyId = salePropId;
          const pRows = await tx
            .select()
            .from(properties)
            .where(eq(properties.id, salePropId))
            .limit(1);
          resolvedProp = pRows[0] || null;
        }

        const principalCash = roundMoney(amountReceived - lateFeeAmount);
        if (principalCash < 0) {
          throw new Error('Late fee cannot exceed total amount received.');
        }

        const lines: any[] = [
          {
            accountId: cashBankAccountId,
            debit: amountReceived,
            credit: 0,
            narration: b.narration || `Receipt from ${custName}`,
          },
        ];

        const allocationsToSave: { installmentId: number; amountApplied: number; lateFeeApplied: number }[] = [];

        if (resolvedSale && (receiptCategory === 'Installment' || receiptCategory === 'Advance' || selectedInstallmentIds.length > 0)) {
          const saleInstallments = await tx
            .select()
            .from(installments)
            .where(eq(installments.saleId, resolvedSale.id))
            .orderBy(asc(installments.installmentNumber));

          const unpaid = saleInstallments.filter(
            (i) => i.status !== 'Paid' && i.status !== 'Cancelled' && Number(i.remainingAmount) > 0.005
          );

          const targetInstallments =
            selectedInstallmentIds.length > 0
              ? unpaid.filter((i) => selectedInstallmentIds.includes(i.id))
              : unpaid;

          const totalRemainingTarget = roundMoney(
            targetInstallments.reduce((acc, i) => acc + Number(i.remainingAmount), 0)
          );

          if (receiptCategory !== 'Advance' && principalCash > totalRemainingTarget + 0.01) {
            throw new Error(
              `Overpayment prevented: Principal PKR ${principalCash.toFixed(2)} exceeds remaining balance PKR ${totalRemainingTarget.toFixed(2)} for selected installments. Choose "Advance Installments" to record excess as Customer Advance.`
            );
          }

          let remainingToAllocate = principalCash;
          let allocatedPrincipal = 0;

          for (const inst of targetInstallments) {
            if (remainingToAllocate <= 0.005) break;
            const instRem = Number(inst.remainingAmount);
            const applyAmt = roundMoney(Math.min(remainingToAllocate, instRem));
            const newPaid = roundMoney(Number(inst.paidAmount) + applyAmt);
            const newRem = roundMoney(instRem - applyAmt);
            const newStatus = newRem <= 0.005 ? 'Paid' : 'Partially Paid';

            await tx
              .update(installments)
              .set({
                paidAmount: formatMoneyStr(newPaid),
                remainingAmount: formatMoneyStr(newRem),
                paymentDate: voucherDate,
                status: newStatus,
                lateFee:
                  lateFeeAmount > 0 && allocationsToSave.length === 0
                    ? formatMoneyStr(Number(inst.lateFee) + lateFeeAmount)
                    : inst.lateFee,
                updatedAt: new Date(),
              })
              .where(eq(installments.id, inst.id));

            allocationsToSave.push({
              installmentId: inst.id,
              amountApplied: applyAmt,
              lateFeeApplied: allocationsToSave.length === 0 ? lateFeeAmount : 0,
            });

            allocatedPrincipal = roundMoney(allocatedPrincipal + applyAmt);
            remainingToAllocate = roundMoney(remainingToAllocate - applyAmt);
          }

          const incomeCode = resolvedProp?.category === 'Shop' ? '4200' : '4100';
          const salesIncomeAcc = await getSystemAccountByCode(tx, incomeCode);

          if (allocatedPrincipal > 0) {
            lines.push({
              accountId: receivableAcc.id,
              debit: 0,
              credit: allocatedPrincipal,
              narration: `Installment recovery (${resolvedSale.invoiceNumber})`,
            });
            lines.push({
              accountId: deferredRevAcc.id,
              debit: allocatedPrincipal,
              credit: 0,
              narration: `Realize deferred revenue (${resolvedSale.invoiceNumber})`,
            });
            lines.push({
              accountId: salesIncomeAcc.id,
              debit: 0,
              credit: allocatedPrincipal,
              narration: `Earned property sale income (${resolvedProp?.propertyNumber || ''})`,
            });
          }

          if (remainingToAllocate > 0.005) {
            lines.push({
              accountId: customerAdvAcc.id,
              debit: 0,
              credit: remainingToAllocate,
              narration: `Customer advance balance (${resolvedSale.invoiceNumber})`,
            });
          }

          // Check if all installments for sale are now Paid
          const refreshedInsts = await tx
            .select()
            .from(installments)
            .where(eq(installments.saleId, resolvedSale.id));
          const allPaid = refreshedInsts.every(
            (i) => i.status === 'Paid' || i.status === 'Cancelled'
          );
          if (allPaid && refreshedInsts.some((i) => i.status === 'Paid')) {
            await tx
              .update(sales)
              .set({ status: 'Completed', remainingAmount: '0.00', updatedAt: new Date() })
              .where(eq(sales.id, resolvedSale.id));
            if (resolvedPropertyId) {
              await tx
                .update(properties)
                .set({ bookingStatus: 'Sold', updatedAt: new Date() })
                .where(eq(properties.id, resolvedPropertyId));
            }
          }
        } else if (resolvedSale) {
          // Booking / Down Payment / Additional against sale
          const incomeCode = resolvedProp?.category === 'Shop' ? '4200' : '4100';
          const salesIncomeAcc = await getSystemAccountByCode(tx, incomeCode);
          if (principalCash > 0) {
            lines.push({
              accountId: receivableAcc.id,
              debit: 0,
              credit: principalCash,
              narration: `${receiptCategory} received (${resolvedSale.invoiceNumber})`,
            });
            lines.push({
              accountId: deferredRevAcc.id,
              debit: principalCash,
              credit: 0,
              narration: `Realize deferred revenue (${resolvedSale.invoiceNumber})`,
            });
            lines.push({
              accountId: salesIncomeAcc.id,
              debit: 0,
              credit: principalCash,
              narration: `Earned income on ${receiptCategory}`,
            });
          }
        } else {
          // General Other Customer Receipt or Miscellaneous Income
          const creditAccountId = b.creditAccountId
            ? Number(b.creditAccountId)
            : customerId
            ? customerAdvAcc.id
            : otherIncomeAcc.id;
          if (principalCash > 0) {
            lines.push({
              accountId: creditAccountId,
              debit: 0,
              credit: principalCash,
              narration: b.narration || `${receiptCategory} receipt`,
            });
          }
        }

        if (lateFeeAmount > 0) {
          lines.push({
            accountId: lateFeeAcc.id,
            debit: 0,
            credit: lateFeeAmount,
            narration: `Late payment charges collected`,
          });
        }

        const voucher = await postBalancedVoucher(tx, {
          voucherNumber: crvNumber,
          voucherType: 'CRV',
          voucherDate,
          customerId,
          propertyId: resolvedPropertyId,
          saleId,
          cashBankAccountId,
          partyName: custName,
          receiptCategory,
          paymentMethod: String(b.paymentMethod || 'Cash'),
          referenceNo: String(b.referenceNo || ''),
          narration: String(b.narration || `${receiptCategory} receipt from ${custName}`),
          createdByUid: req.dbUser?.uid || 'system',
          lines,
        });

        for (const alloc of allocationsToSave) {
          await tx.insert(installmentAllocations).values({
            voucherId: voucher.id,
            installmentId: alloc.installmentId,
            amountApplied: formatMoneyStr(alloc.amountApplied),
            lateFeeApplied: formatMoneyStr(alloc.lateFeeApplied),
          });
        }

        await syncInstallmentStatuses(tx);
        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CREATE_CRV',
          'voucher',
          voucher.id,
          `Posted CRV ${crvNumber} for PKR ${amountReceived} (${receiptCategory})`
        );

        return voucher;
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Create CRV error:', error);
      res.status(400).json({ error: error.message || 'Failed to post Cash Receipt Voucher' });
    }
  }
);

// Cash Payment Voucher (CPV)
accountingRouter.post(
  '/vouchers/cpv',
  requireRole(['admin', 'accounts']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const amount = roundMoney(Number(b.amount || 0));
      const expenseAccountId = Number(b.expenseAccountId);
      const cashBankAccountId = Number(b.cashBankAccountId);
      const voucherDate = b.voucherDate || new Date().toISOString().slice(0, 10);
      const paidTo = String(b.paidTo || '').trim();

      if (amount <= 0 || !expenseAccountId || !cashBankAccountId || !paidTo) {
        return res.status(400).json({
          error: 'Paid To, Expense/Account Head, Cash/Bank Account, and positive Amount are required.',
        });
      }

      const created = await db.transaction(async (tx) => {
        const settingsRows = await tx.select().from(companySettings).limit(1);
        const cpvNumber = await generateNextVoucherNumber(
          tx,
          settingsRows[0]?.cpvPrefix || 'CPV'
        );

        const voucher = await postBalancedVoucher(tx, {
          voucherNumber: cpvNumber,
          voucherType: 'CPV',
          voucherDate,
          cashBankAccountId,
          partyName: paidTo,
          paymentMethod: String(b.paymentMethod || 'Cash'),
          referenceNo: String(b.referenceNo || ''),
          narration: String(b.narration || `Payment to ${paidTo}`),
          createdByUid: req.dbUser?.uid || 'system',
          lines: [
            {
              accountId: expenseAccountId,
              debit: amount,
              credit: 0,
              narration: b.narration || `Expense paid to ${paidTo}`,
            },
            {
              accountId: cashBankAccountId,
              debit: 0,
              credit: amount,
              narration: `Cash/Bank disbursement (${cpvNumber})`,
            },
          ],
        });

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CREATE_CPV',
          'voucher',
          voucher.id,
          `Posted CPV ${cpvNumber} to ${paidTo} for PKR ${amount}`
        );

        return voucher;
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Create CPV error:', error);
      res.status(400).json({ error: error.message || 'Failed to post Cash Payment Voucher' });
    }
  }
);

// Journal Voucher (JV)
accountingRouter.post(
  '/vouchers/jv',
  requireRole(['admin', 'accounts']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const voucherDate = b.voucherDate || new Date().toISOString().slice(0, 10);
      const lines = Array.isArray(b.lines) ? b.lines : [];

      const created = await db.transaction(async (tx) => {
        const settingsRows = await tx.select().from(companySettings).limit(1);
        const jvNumber = await generateNextVoucherNumber(
          tx,
          settingsRows[0]?.jvPrefix || 'JV'
        );

        const voucher = await postBalancedVoucher(tx, {
          voucherNumber: jvNumber,
          voucherType: 'JV',
          voucherDate,
          customerId: b.customerId ? Number(b.customerId) : null,
          propertyId: b.propertyId ? Number(b.propertyId) : null,
          narration: String(b.narration || 'Journal Voucher Entry'),
          createdByUid: req.dbUser?.uid || 'system',
          lines: lines.map((l: any) => ({
            accountId: Number(l.accountId),
            debit: roundMoney(Number(l.debit || 0)),
            credit: roundMoney(Number(l.credit || 0)),
            narration: String(l.narration || b.narration || ''),
          })),
        });

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CREATE_JV',
          'voucher',
          voucher.id,
          `Posted JV ${jvNumber} total PKR ${voucher.totalAmount}`
        );

        return voucher;
      });

      res.status(201).json(created);
    } catch (error: any) {
      console.error('Create JV error:', error);
      res.status(400).json({ error: error.message || 'Failed to post Journal Voucher' });
    }
  }
);

// Cancel / Reverse Voucher (Authorized reversal, never deletes posted ledger lines)
accountingRouter.post(
  '/vouchers/:id/cancel',
  requireRole(['admin', 'accounts']),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const reason = String(req.body?.reason || 'Authorized voucher cancellation').trim();

      await db.transaction(async (tx) => {
        const vRows = await tx.select().from(vouchers).where(eq(vouchers.id, id)).limit(1);
        const v = vRows[0];
        if (!v) throw new Error('Voucher not found.');
        if (v.status === 'Cancelled') throw new Error('Voucher is already cancelled.');
        if (v.voucherType === 'REVERSAL') throw new Error('Cannot cancel a reversal voucher.');

        const entries = await tx
          .select()
          .from(ledgerEntries)
          .where(eq(ledgerEntries.voucherId, v.id));

        const revNumber = await generateNextVoucherNumber(tx, 'REV');
        await postBalancedVoucher(tx, {
          voucherNumber: revNumber,
          voucherType: 'REVERSAL',
          voucherDate: new Date().toISOString().slice(0, 10),
          customerId: v.customerId,
          propertyId: v.propertyId,
          saleId: v.saleId,
          partyName: v.partyName,
          narration: `Reversal of ${v.voucherNumber}: ${reason}`,
          createdByUid: req.dbUser?.uid || 'system',
          reversedVoucherId: v.id,
          lines: entries.map((e) => ({
            accountId: e.accountId,
            debit: Number(e.credit),
            credit: Number(e.debit),
            narration: `Reversal of ${v.voucherNumber}`,
            customerId: e.customerId,
            propertyId: e.propertyId,
            saleId: e.saleId,
          })),
        });

        await tx.update(vouchers).set({ status: 'Cancelled' }).where(eq(vouchers.id, v.id));

        // Rollback installment allocations if CRV
        const allocs = await tx
          .select()
          .from(installmentAllocations)
          .where(eq(installmentAllocations.voucherId, v.id));

        for (const a of allocs) {
          const iRows = await tx
            .select()
            .from(installments)
            .where(eq(installments.id, a.installmentId))
            .limit(1);
          if (iRows[0]) {
            const inst = iRows[0];
            const newPaid = roundMoney(Math.max(0, Number(inst.paidAmount) - Number(a.amountApplied)));
            const newRem = roundMoney(Number(inst.installmentAmount) - newPaid);
            await tx
              .update(installments)
              .set({
                paidAmount: formatMoneyStr(newPaid),
                remainingAmount: formatMoneyStr(newRem),
                status: newPaid > 0 ? 'Partially Paid' : 'Upcoming',
                updatedAt: new Date(),
              })
              .where(eq(installments.id, inst.id));
          }
        }
        await syncInstallmentStatuses(tx);

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CANCEL_VOUCHER',
          'voucher',
          v.id,
          `Reversed voucher ${v.voucherNumber} via ${revNumber}: ${reason}`
        );
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Cancel voucher error:', error);
      res.status(400).json({ error: error.message || 'Failed to cancel voucher' });
    }
  }
);

// Ledgers & Financial Statements
accountingRouter.get('/ledgers', async (req: AuthRequest, res) => {
  try {
    const mode = String(req.query.mode || 'general');
    const fromDate = String(req.query.fromDate || '2000-01-01');
    const toDate = String(req.query.toDate || '2099-12-31');
    const accountId = req.query.accountId ? Number(req.query.accountId) : null;
    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : null;

    const [allAccs, allLedger, allVouchers, allCusts, allProps] = await Promise.all([
      db.select().from(accounts).orderBy(asc(accounts.code)),
      db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.entryDate), asc(ledgerEntries.id)),
      db.select().from(vouchers),
      db.select().from(customers),
      db.select().from(properties),
    ]);

    const accMap = new Map(allAccs.map((a) => [a.id, a]));
    const vMap = new Map(allVouchers.map((v) => [v.id, v]));
    const custMap = new Map(allCusts.map((c) => [c.id, c]));
    const propMap = new Map(allProps.map((p) => [p.id, p]));

    // Exclude cancelled+reversed noise only if desired? Wait: in proper double-entry accounting,
    // both the original voucher AND its reversal remain in the General Ledger so balances net to 0 cleanly!
    // Let's include all ledger rows with full voucher status badge so auditability is 100%.

    if (mode === 'trial_balance') {
      const tbRows = allAccs.map((acc) => {
        let periodDebit = 0;
        let periodCredit = 0;
        const opening = Number(acc.openingBalance);
        for (const le of allLedger) {
          if (le.accountId !== acc.id) continue;
          if (le.entryDate > toDate) continue;
          periodDebit = roundMoney(periodDebit + Number(le.debit));
          periodCredit = roundMoney(periodCredit + Number(le.credit));
        }
        const net =
          acc.normalBalance === 'DEBIT'
            ? roundMoney(opening + periodDebit - periodCredit)
            : roundMoney(opening + periodCredit - periodDebit);

        const debitBal =
          acc.normalBalance === 'DEBIT'
            ? net >= 0
              ? net
              : 0
            : net < 0
            ? Math.abs(net)
            : 0;
        const creditBal =
          acc.normalBalance === 'CREDIT'
            ? net >= 0
              ? net
              : 0
            : net < 0
            ? Math.abs(net)
            : 0;

        return {
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          accountType: acc.accountType,
          totalDebit: periodDebit,
          totalCredit: periodCredit,
          debitBalance: debitBal,
          creditBalance: creditBal,
        };
      });

      const nonZero = tbRows.filter(
        (r) => r.totalDebit > 0 || r.totalCredit > 0 || r.debitBalance > 0 || r.creditBalance > 0
      );
      const sumDebit = roundMoney(nonZero.reduce((a, r) => a + r.debitBalance, 0));
      const sumCredit = roundMoney(nonZero.reduce((a, r) => a + r.creditBalance, 0));
      return res.json({ rows: nonZero, sumDebit, sumCredit });
    }

    if (mode === 'income_statement' || mode === 'balance_sheet') {
      const accountBalances = new Map<number, number>();
      for (const acc of allAccs) {
        let deb = 0;
        let cred = 0;
        for (const le of allLedger) {
          if (le.accountId !== acc.id) continue;
          if (mode === 'income_statement' && (le.entryDate < fromDate || le.entryDate > toDate)) {
            continue;
          }
          if (mode === 'balance_sheet' && le.entryDate > toDate) {
            continue;
          }
          deb = roundMoney(deb + Number(le.debit));
          cred = roundMoney(cred + Number(le.credit));
        }
        const open = mode === 'balance_sheet' ? Number(acc.openingBalance) : 0;
        const bal =
          acc.normalBalance === 'DEBIT'
            ? roundMoney(open + deb - cred)
            : roundMoney(open + cred - deb);
        accountBalances.set(acc.id, bal);
      }

      if (mode === 'income_statement') {
        const incomeAccounts = allAccs
          .filter((a) => a.accountType === 'INCOME' && a.parentId !== null)
          .map((a) => ({ ...a, amount: accountBalances.get(a.id) || 0 }));
        const expenseAccounts = allAccs
          .filter((a) => a.accountType === 'EXPENSE' && a.parentId !== null)
          .map((a) => ({ ...a, amount: accountBalances.get(a.id) || 0 }));
        const totalIncome = roundMoney(incomeAccounts.reduce((s, a) => s + a.amount, 0));
        const totalExpenses = roundMoney(expenseAccounts.reduce((s, a) => s + a.amount, 0));
        return res.json({
          incomeAccounts,
          expenseAccounts,
          totalIncome,
          totalExpenses,
          netProfit: roundMoney(totalIncome - totalExpenses),
        });
      }

      // Balance Sheet
      const assets = allAccs
        .filter((a) => a.accountType === 'ASSET' && a.parentId !== null)
        .map((a) => ({ ...a, amount: accountBalances.get(a.id) || 0 }));
      const liabilities = allAccs
        .filter((a) => a.accountType === 'LIABILITY' && a.parentId !== null)
        .map((a) => ({ ...a, amount: accountBalances.get(a.id) || 0 }));
      const capital = allAccs
        .filter((a) => a.accountType === 'CAPITAL' && a.parentId !== null)
        .map((a) => ({ ...a, amount: accountBalances.get(a.id) || 0 }));

      const incTotal = allAccs
        .filter((a) => a.accountType === 'INCOME' && a.parentId !== null)
        .reduce((s, a) => s + (accountBalances.get(a.id) || 0), 0);
      const expTotal = allAccs
        .filter((a) => a.accountType === 'EXPENSE' && a.parentId !== null)
        .reduce((s, a) => s + (accountBalances.get(a.id) || 0), 0);
      const currentPeriodEarnings = roundMoney(incTotal - expTotal);

      const totalAssets = roundMoney(assets.reduce((s, a) => s + a.amount, 0));
      const totalLiabilities = roundMoney(liabilities.reduce((s, a) => s + a.amount, 0));
      const totalCapital = roundMoney(
        capital.reduce((s, a) => s + a.amount, 0) + currentPeriodEarnings
      );

      return res.json({
        assets,
        liabilities,
        capital,
        currentPeriodEarnings,
        totalAssets,
        totalLiabilities,
        totalCapital,
        totalLiabilitiesAndCapital: roundMoney(totalLiabilities + totalCapital),
      });
    }

    // Transaction Ledger filtering
    let filteredEntries = allLedger.filter((le) => {
      const acc = accMap.get(le.accountId);
      if (!acc) return false;

      if (mode === 'account' && accountId && le.accountId !== accountId) return false;
      if (mode === 'customer') {
        if (!customerId || le.customerId !== customerId) return false;
        // For Customer Receivable sub-ledger, show receivable & cash/advance lines or specifically receivable account (1400/1300)
        if (acc.code !== '1400' && acc.code !== '1300') return false;
      }
      if (mode === 'property') {
        if (!propertyId || le.propertyId !== propertyId) return false;
        if (acc.code !== '1400' && acc.code !== '1300') return false;
      }
      if (mode === 'cash' && acc.code !== '1100') return false;
      if (mode === 'bank' && !acc.code.startsWith('12')) return false;
      if (mode === 'expense' && acc.accountType !== 'EXPENSE') return false;
      if (mode === 'income' && acc.accountType !== 'INCOME') return false;
      if (mode === 'receivables' && acc.code !== '1400' && acc.code !== '1300') return false;

      return true;
    });

    // Compute Opening Balance prior to fromDate
    let openingBalance = 0;
    if (mode === 'account' && accountId) {
      const acc = accMap.get(accountId);
      openingBalance = Number(acc?.openingBalance || 0);
    } else if (mode === 'cash') {
      const cashAcc = allAccs.find((a) => a.code === '1100');
      openingBalance = Number(cashAcc?.openingBalance || 0);
    } else if (mode === 'bank') {
      openingBalance = allAccs
        .filter((a) => a.code.startsWith('12'))
        .reduce((s, a) => s + Number(a.openingBalance), 0);
    }

    const priorEntries = filteredEntries.filter((e) => e.entryDate < fromDate);
    for (const pe of priorEntries) {
      openingBalance = roundMoney(openingBalance + Number(pe.debit) - Number(pe.credit));
    }

    const periodEntries = filteredEntries.filter(
      (e) => e.entryDate >= fromDate && e.entryDate <= toDate
    );

    let runningBalance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const rows = periodEntries.map((e) => {
      const deb = Number(e.debit);
      const cred = Number(e.credit);
      runningBalance = roundMoney(runningBalance + deb - cred);
      totalDebit = roundMoney(totalDebit + deb);
      totalCredit = roundMoney(totalCredit + cred);
      const v = vMap.get(e.voucherId);
      const acc = accMap.get(e.accountId);
      const cust = e.customerId ? custMap.get(e.customerId) : null;
      const prop = e.propertyId ? propMap.get(e.propertyId) : null;

      return {
        id: e.id,
        entryDate: e.entryDate,
        voucherId: e.voucherId,
        voucherNumber: v?.voucherNumber || '',
        voucherType: v?.voucherType || '',
        voucherStatus: v?.status || '',
        accountCode: acc?.code || '',
        accountName: acc?.name || '',
        customerName: cust?.fullName || '',
        propertyNumber: prop?.propertyNumber || '',
        narration: e.narration,
        debit: deb,
        credit: cred,
        runningBalance,
      };
    });

    res.json({
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance: runningBalance,
      rows,
    });
  } catch (error) {
    console.error('Ledger query error:', error);
    res.status(500).json({ error: 'Failed to load ledger report' });
  }
});

// Comprehensive Reports Hub (Recovery Aging, Sales, Inventory, Accounting)
accountingRouter.get('/reports', async (req: AuthRequest, res) => {
  try {
    const category = String(req.query.category || 'recovery');
    const fromDate = String(req.query.fromDate || '2000-01-01');
    const toDate = String(req.query.toDate || '2099-12-31');

    const [allSales, allInsts, allVouchers, allProps, allCusts] = await Promise.all([
      db.select().from(sales),
      db.select().from(installments),
      db.select().from(vouchers),
      db.select().from(properties),
      db.select().from(customers),
    ]);

    const custMap = new Map(allCusts.map((c) => [c.id, c]));
    const propMap = new Map(allProps.map((p) => [p.id, p]));
    const saleMap = new Map(allSales.map((s) => [s.id, s]));

    if (category === 'recovery') {
      const today = new Date().toISOString().slice(0, 10);
      const todayMs = new Date(today).getTime();

      const activeInsts = allInsts.filter((i) => i.status !== 'Cancelled');
      const totalRecoverable = roundMoney(
        activeInsts.reduce((s, i) => s + Number(i.installmentAmount), 0)
      );
      const totalRecovered = roundMoney(
        activeInsts.reduce((s, i) => s + Number(i.paidAmount), 0)
      );
      const totalPending = roundMoney(
        activeInsts.reduce((s, i) => s + Number(i.remainingAmount), 0)
      );
      const recoveryPercentage =
        totalRecoverable > 0 ? roundMoney((totalRecovered / totalRecoverable) * 100) : 0;

      // Aging Buckets for overdue installments
      const aging = {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        above90: 0,
      };

      const customerPendingMap = new Map<
        number,
        {
          customerId: number;
          customerCode: string;
          customerName: string;
          mobile: string;
          propertyNumbers: Set<string>;
          totalScheduled: number;
          totalPaid: number;
          pendingBalance: number;
          overdueAmount: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          above90: number;
        }
      >();

      for (const inst of activeInsts) {
        const rem = Number(inst.remainingAmount);
        const paid = Number(inst.paidAmount);
        const amt = Number(inst.installmentAmount);
        const cust = custMap.get(inst.customerId);
        const prop = propMap.get(inst.propertyId);

        let entry = customerPendingMap.get(inst.customerId);
        if (!entry) {
          entry = {
            customerId: inst.customerId,
            customerCode: cust?.customerCode || '',
            customerName: cust?.fullName || '',
            mobile: cust?.mobile || '',
            propertyNumbers: new Set(),
            totalScheduled: 0,
            totalPaid: 0,
            pendingBalance: 0,
            overdueAmount: 0,
            days1to30: 0,
            days31to60: 0,
            days61to90: 0,
            above90: 0,
          };
          customerPendingMap.set(inst.customerId, entry);
        }
        if (prop) entry.propertyNumbers.add(prop.propertyNumber);
        entry.totalScheduled = roundMoney(entry.totalScheduled + amt);
        entry.totalPaid = roundMoney(entry.totalPaid + paid);
        entry.pendingBalance = roundMoney(entry.pendingBalance + rem);

        if (rem > 0.005) {
          const dueMs = new Date(inst.dueDate).getTime();
          const diffDays = Math.floor((todayMs - dueMs) / (1000 * 60 * 60 * 24));
          if (diffDays <= 0) {
            aging.current = roundMoney(aging.current + rem);
          } else {
            entry.overdueAmount = roundMoney(entry.overdueAmount + rem);
            if (diffDays <= 30) {
              aging.days1to30 = roundMoney(aging.days1to30 + rem);
              entry.days1to30 = roundMoney(entry.days1to30 + rem);
            } else if (diffDays <= 60) {
              aging.days31to60 = roundMoney(aging.days31to60 + rem);
              entry.days31to60 = roundMoney(entry.days31to60 + rem);
            } else if (diffDays <= 90) {
              aging.days61to90 = roundMoney(aging.days61to90 + rem);
              entry.days61to90 = roundMoney(entry.days61to90 + rem);
            } else {
              aging.above90 = roundMoney(aging.above90 + rem);
              entry.above90 = roundMoney(entry.above90 + rem);
            }
          }
        }
      }

      const periodRecoveries = allVouchers
        .filter(
          (v) =>
            v.voucherType === 'CRV' &&
            v.status === 'Posted' &&
            v.voucherDate >= fromDate &&
            v.voucherDate <= toDate
        )
        .map((v) => ({
          ...v,
          customerName: v.customerId ? custMap.get(v.customerId)?.fullName || v.partyName : v.partyName,
          propertyNumber: v.propertyId ? propMap.get(v.propertyId)?.propertyNumber || '' : '',
          invoiceNumber: v.saleId ? saleMap.get(v.saleId)?.invoiceNumber || '' : '',
        }));

      return res.json({
        summary: {
          totalRecoverable,
          totalRecovered,
          totalPending,
          recoveryPercentage,
          aging,
        },
        customerBalances: Array.from(customerPendingMap.values()).map((c) => ({
          ...c,
          properties: Array.from(c.propertyNumbers).join(', '),
        })),
        periodRecoveries,
      });
    }

    if (category === 'sales') {
      const periodSales = allSales
        .filter((s) => s.saleDate >= fromDate && s.saleDate <= toDate)
        .map((s) => ({
          ...s,
          customerName: custMap.get(s.customerId)?.fullName || '',
          propertyNumber: propMap.get(s.propertyId)?.propertyNumber || '',
          block: propMap.get(s.propertyId)?.block || '',
          propertyCategory: propMap.get(s.propertyId)?.category || '',
        }));
      return res.json({ sales: periodSales });
    }

    if (category === 'inventory') {
      return res.json({ properties: allProps });
    }

    // Vouchers / Accounting Register
    const periodVouchers = allVouchers
      .filter((v) => v.voucherDate >= fromDate && v.voucherDate <= toDate)
      .map((v) => ({
        ...v,
        customerName: v.customerId ? custMap.get(v.customerId)?.fullName || v.partyName : v.partyName,
        propertyNumber: v.propertyId ? propMap.get(v.propertyId)?.propertyNumber || '' : '',
      }));

    res.json({ vouchers: periodVouchers });
  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});
