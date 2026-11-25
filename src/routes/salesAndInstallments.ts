import { Router } from 'express';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  companySettings,
  customers,
  installments,
  ledgerEntries,
  properties,
  sales,
  vouchers,
} from '../db/schema.ts';
import { requireRole, type AuthRequest } from '../middleware/auth.ts';
import {
  addMonthsToDate,
  formatMoneyStr,
  generateNextInvoiceNumber,
  generateNextVoucherNumber,
  getSystemAccountByCode,
  logAudit,
  postBalancedVoucher,
  roundMoney,
  syncInstallmentStatuses,
} from '../services/accounting.ts';

export const salesRouter = Router();

salesRouter.get('/sales', async (_req: AuthRequest, res) => {
  try {
    const [saleRows, custRows, propRows, instRows] = await Promise.all([
      db.select().from(sales).orderBy(desc(sales.id)),
      db.select().from(customers),
      db.select().from(properties),
      db.select().from(installments),
    ]);

    const custMap = new Map(custRows.map((c) => [c.id, c]));
    const propMap = new Map(propRows.map((p) => [p.id, p]));

    const instBySale = new Map<number, typeof instRows>();
    for (const inst of instRows) {
      const list = instBySale.get(inst.saleId) || [];
      list.push(inst);
      instBySale.set(inst.saleId, list);
    }

    const enriched = saleRows.map((s) => {
      const sInsts = instBySale.get(s.id) || [];
      const paidInstallments = roundMoney(
        sInsts.reduce((acc, i) => acc + Number(i.paidAmount), 0)
      );
      const pendingInstallments = roundMoney(
        sInsts
          .filter((i) => i.status !== 'Cancelled')
          .reduce((acc, i) => acc + Number(i.remainingAmount), 0)
      );
      return {
        ...s,
        customer: custMap.get(s.customerId) || null,
        property: propMap.get(s.propertyId) || null,
        totalCollected:
          s.saleType === 'CASH'
            ? Number(s.netSaleAmount)
            : roundMoney(Number(s.bookingAmount) + Number(s.downPayment) + paidInstallments),
        pendingBalance: s.saleType === 'CASH' ? 0 : pendingInstallments,
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Fetch sales error:', error);
    res.status(500).json({ error: 'Failed to load sales' });
  }
});

salesRouter.get('/sales/:id', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const saleRows = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
    if (!saleRows[0]) {
      return res.status(404).json({ error: 'Sale invoice not found' });
    }
    const sale = saleRows[0];
    const [custRows, propRows, instRows, voucherRows] = await Promise.all([
      db.select().from(customers).where(eq(customers.id, sale.customerId)).limit(1),
      db.select().from(properties).where(eq(properties.id, sale.propertyId)).limit(1),
      db
        .select()
        .from(installments)
        .where(eq(installments.saleId, id))
        .orderBy(asc(installments.installmentNumber)),
      db.select().from(vouchers).where(eq(vouchers.saleId, id)).orderBy(desc(vouchers.id)),
    ]);

    res.json({
      sale,
      customer: custRows[0] || null,
      property: propRows[0] || null,
      installments: instRows,
      vouchers: voucherRows,
    });
  } catch (error) {
    console.error('Fetch sale detail error:', error);
    res.status(500).json({ error: 'Failed to load sale details' });
  }
});

salesRouter.post(
  '/sales',
  requireRole(['admin', 'sales']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const saleType = b.saleType === 'CASH' ? 'CASH' : 'INSTALLMENT';
      const customerId = Number(b.customerId);
      const propertyId = Number(b.propertyId);
      const saleDate = b.saleDate || new Date().toISOString().slice(0, 10);

      if (!customerId || !propertyId) {
        return res.status(400).json({ error: 'Customer and Property are required.' });
      }

      const result = await db.transaction(async (tx) => {
        const [propRows, custRows, settingsRows] = await Promise.all([
          tx.select().from(properties).where(eq(properties.id, propertyId)).limit(1),
          tx.select().from(customers).where(eq(customers.id, customerId)).limit(1),
          tx.select().from(companySettings).limit(1),
        ]);

        const prop = propRows[0];
        const cust = custRows[0];
        const settings = settingsRows[0];
        if (!prop) throw new Error('Property not found.');
        if (!cust) throw new Error('Customer not found.');
        if (prop.bookingStatus !== 'Available' && prop.bookingStatus !== 'Reserved') {
          throw new Error(
            `Property ${prop.propertyNumber} is currently "${prop.bookingStatus}" and cannot be sold.`
          );
        }

        const totalPrice = roundMoney(Number(b.totalPrice ?? prop.totalPrice));
        const discount = roundMoney(Number(b.discount || 0));
        if (discount < 0 || discount >= totalPrice) {
          throw new Error('Invalid discount amount.');
        }
        const netSaleAmount = roundMoney(totalPrice - discount);
        const invoiceNumber = await generateNextInvoiceNumber(
          tx,
          settings?.invoicePrefix || 'INV'
        );

        const incomeAccountCode = prop.category === 'Shop' ? '4200' : '4100';
        const incomeAccount = await getSystemAccountByCode(tx, incomeAccountCode);
        const receivableAccount = await getSystemAccountByCode(tx, '1400');
        const deferredRevAccount = await getSystemAccountByCode(tx, '2300');

        let cashBankAccountId = Number(b.cashBankAccountId || 0);
        if (!cashBankAccountId) {
          const defaultCash = await getSystemAccountByCode(tx, '1100');
          cashBankAccountId = defaultCash.id;
        }

        if (saleType === 'CASH') {
          const [createdSale] = await tx
            .insert(sales)
            .values({
              invoiceNumber,
              saleType: 'CASH',
              saleDate,
              customerId,
              propertyId,
              totalPrice: formatMoneyStr(totalPrice),
              discount: formatMoneyStr(discount),
              netSaleAmount: formatMoneyStr(netSaleAmount),
              bookingAmount: '0.00',
              downPayment: formatMoneyStr(netSaleAmount),
              remainingAmount: '0.00',
              durationMonths: 0,
              monthlyInstallment: '0.00',
              firstInstallmentDate: '',
              dueDay: 10,
              paymentFrequency: 'One-Time',
              paymentMethod: String(b.paymentMethod || 'Cash'),
              cashBankAccountId,
              termsAndConditions: String(b.termsAndConditions || ''),
              remarks: String(b.remarks || ''),
              status: 'Completed',
              createdByUid: req.dbUser?.uid || null,
            })
            .returning();

          await tx
            .update(properties)
            .set({
              bookingStatus: 'Sold',
              saleStatus: 'Cash Sold',
              updatedAt: new Date(),
            })
            .where(eq(properties.id, propertyId));

          const crvNumber = await generateNextVoucherNumber(
            tx,
            settings?.crvPrefix || 'CRV'
          );
          await postBalancedVoucher(tx, {
            voucherNumber: crvNumber,
            voucherType: 'CRV',
            voucherDate: saleDate,
            customerId,
            propertyId,
            saleId: createdSale.id,
            cashBankAccountId,
            partyName: cust.fullName,
            receiptCategory: 'Cash Sale',
            paymentMethod: String(b.paymentMethod || 'Cash'),
            referenceNo: invoiceNumber,
            narration: `Cash Sale of ${prop.category} ${prop.propertyNumber} (${invoiceNumber})`,
            createdByUid: req.dbUser?.uid || 'system',
            lines: [
              {
                accountId: cashBankAccountId,
                debit: netSaleAmount,
                credit: 0,
                narration: `Cash received against ${invoiceNumber}`,
              },
              {
                accountId: incomeAccount.id,
                debit: 0,
                credit: netSaleAmount,
                narration: `Cash property sale income (${prop.propertyNumber})`,
              },
            ],
          });

          await logAudit(
            tx,
            req.dbUser?.uid || null,
            req.dbUser?.email || null,
            'CREATE_CASH_SALE',
            'sale',
            createdSale.id,
            `Cash sale ${invoiceNumber} for ${prop.propertyNumber} net PKR ${netSaleAmount}`
          );

          return createdSale;
        }

        // INSTALLMENT SALE
        const bookingAmount = roundMoney(Number(b.bookingAmount || 0));
        const downPayment = roundMoney(Number(b.downPayment || 0));
        const initialCollection = roundMoney(bookingAmount + downPayment);
        const durationMonths = parseInt(String(b.durationMonths || 12), 10);

        if (bookingAmount < 0 || downPayment < 0) {
          throw new Error('Booking and down payment cannot be negative.');
        }
        if (initialCollection >= netSaleAmount) {
          throw new Error(
            'Initial booking + down payment equals or exceeds Net Sale Amount. Use Cash Sale instead.'
          );
        }
        if (durationMonths < 1 || durationMonths > 240) {
          throw new Error('Installment duration must be between 1 and 240 months.');
        }

        const remainingAmount = roundMoney(netSaleAmount - initialCollection);
        const frequency = String(b.paymentFrequency || 'Monthly');
        const stepMonths =
          frequency === 'Quarterly' ? 3 : frequency === 'Semi-Annual' ? 6 : 1;
        const firstInstallmentDate =
          b.firstInstallmentDate || addMonthsToDate(saleDate, stepMonths, Number(b.dueDay || 10));
        const dueDay = Number(b.dueDay || firstInstallmentDate.split('-')[2] || 10);

        const baseInstallment = Math.floor((remainingAmount / durationMonths) * 100) / 100;
        const monthlyInstallment = roundMoney(remainingAmount / durationMonths);

        const [createdSale] = await tx
          .insert(sales)
          .values({
            invoiceNumber,
            saleType: 'INSTALLMENT',
            saleDate,
            customerId,
            propertyId,
            totalPrice: formatMoneyStr(totalPrice),
            discount: formatMoneyStr(discount),
            netSaleAmount: formatMoneyStr(netSaleAmount),
            bookingAmount: formatMoneyStr(bookingAmount),
            downPayment: formatMoneyStr(downPayment),
            remainingAmount: formatMoneyStr(remainingAmount),
            durationMonths,
            monthlyInstallment: formatMoneyStr(monthlyInstallment),
            firstInstallmentDate,
            dueDay,
            paymentFrequency: frequency,
            paymentMethod: String(b.paymentMethod || 'Cash'),
            cashBankAccountId,
            termsAndConditions: String(b.termsAndConditions || ''),
            remarks: String(b.remarks || ''),
            status: 'Active',
            createdByUid: req.dbUser?.uid || null,
          })
          .returning();

        // Update Property Status -> Booked
        await tx
          .update(properties)
          .set({
            bookingStatus: 'Booked',
            saleStatus: 'Installment',
            updatedAt: new Date(),
          })
          .where(eq(properties.id, propertyId));

        // Generate Installment Schedule
        let allocatedSum = 0;
        const today = new Date().toISOString().slice(0, 10);
        for (let idx = 1; idx <= durationMonths; idx++) {
          const isLast = idx === durationMonths;
          const amount = isLast
            ? roundMoney(remainingAmount - allocatedSum)
            : baseInstallment;
          allocatedSum = roundMoney(allocatedSum + amount);
          const dueDate = addMonthsToDate(
            firstInstallmentDate,
            (idx - 1) * stepMonths,
            dueDay
          );
          const initialStatus =
            dueDate < today ? 'Overdue' : dueDate === today ? 'Due' : 'Upcoming';

          await tx.insert(installments).values({
            saleId: createdSale.id,
            customerId,
            propertyId,
            installmentNumber: idx,
            dueDate,
            installmentAmount: formatMoneyStr(amount),
            lateFee: '0.00',
            paidAmount: '0.00',
            remainingAmount: formatMoneyStr(amount),
            paymentDate: '',
            status: initialStatus,
            remarks: '',
          });
        }

        // 1. Accounting entry for Contract Recognition (Installment Receivable vs Deferred Revenue)
        const saleVoucherNumber = await generateNextVoucherNumber(tx, 'SALE');
        await postBalancedVoucher(tx, {
          voucherNumber: saleVoucherNumber,
          voucherType: 'SALE',
          voucherDate: saleDate,
          customerId,
          propertyId,
          saleId: createdSale.id,
          partyName: cust.fullName,
          paymentMethod: String(b.paymentMethod || 'Cash'),
          referenceNo: invoiceNumber,
          narration: `Installment Sale Contract ${invoiceNumber} for ${prop.propertyNumber}`,
          createdByUid: req.dbUser?.uid || 'system',
          lines: [
            {
              accountId: receivableAccount.id,
              debit: netSaleAmount,
              credit: 0,
              narration: `Installment receivable from ${cust.fullName} (${prop.propertyNumber})`,
            },
            {
              accountId: deferredRevAccount.id,
              debit: 0,
              credit: netSaleAmount,
              narration: `Deferred installment revenue (${invoiceNumber})`,
            },
          ],
        });

        // 2. If Booking + Down Payment collected upfront, post CRV + Earned Income Recognition
        if (initialCollection > 0) {
          const crvNumber = await generateNextVoucherNumber(
            tx,
            settings?.crvPrefix || 'CRV'
          );
          await postBalancedVoucher(tx, {
            voucherNumber: crvNumber,
            voucherType: 'CRV',
            voucherDate: saleDate,
            customerId,
            propertyId,
            saleId: createdSale.id,
            cashBankAccountId,
            partyName: cust.fullName,
            receiptCategory: bookingAmount > 0 ? 'Booking & Down Payment' : 'Down Payment',
            paymentMethod: String(b.paymentMethod || 'Cash'),
            referenceNo: invoiceNumber,
            narration: `Initial booking/down payment for ${prop.propertyNumber} (${invoiceNumber})`,
            createdByUid: req.dbUser?.uid || 'system',
            lines: [
              {
                accountId: cashBankAccountId,
                debit: initialCollection,
                credit: 0,
                narration: `Initial receipt against ${invoiceNumber}`,
              },
              {
                accountId: receivableAccount.id,
                debit: 0,
                credit: initialCollection,
                narration: `Reduce installment receivable (${invoiceNumber})`,
              },
              {
                accountId: deferredRevAccount.id,
                debit: initialCollection,
                credit: 0,
                narration: `Recognize collected installment revenue (${invoiceNumber})`,
              },
              {
                accountId: incomeAccount.id,
                debit: 0,
                credit: initialCollection,
                narration: `Realized sales income on booking/down payment (${prop.propertyNumber})`,
              },
            ],
          });
        }

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CREATE_INSTALLMENT_SALE',
          'sale',
          createdSale.id,
          `Installment sale ${invoiceNumber} for ${prop.propertyNumber}, net PKR ${netSaleAmount}, ${durationMonths} months`
        );

        return createdSale;
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error('Create sale error:', error);
      res.status(400).json({ error: error.message || 'Failed to record sale' });
    }
  }
);

salesRouter.post(
  '/sales/:id/cancel',
  requireRole(['admin']),
  async (req: AuthRequest, res) => {
    try {
      const saleId = Number(req.params.id);
      const reason = String(req.body?.reason || 'Sale cancelled by administrator').trim();

      await db.transaction(async (tx) => {
        const saleRows = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1);
        const sale = saleRows[0];
        if (!sale) throw new Error('Sale not found.');
        if (sale.status === 'Cancelled') throw new Error('Sale is already cancelled.');

        const linkedVouchers = await tx
          .select()
          .from(vouchers)
          .where(eq(vouchers.saleId, saleId));

        for (const v of linkedVouchers) {
          if (v.status !== 'Posted' || v.voucherType === 'REVERSAL') continue;
          const entries = await tx
            .select()
            .from(ledgerEntries)
            .where(eq(ledgerEntries.voucherId, v.id));
          if (entries.length > 0) {
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
          }
          await tx
            .update(vouchers)
            .set({ status: 'Cancelled' })
            .where(eq(vouchers.id, v.id));
        }

        await tx
          .update(installments)
          .set({ status: 'Cancelled', updatedAt: new Date() })
          .where(eq(installments.saleId, saleId));

        await tx
          .update(sales)
          .set({
            status: 'Cancelled',
            remarks: `${sale.remarks ? sale.remarks + ' | ' : ''}Cancelled: ${reason}`,
            updatedAt: new Date(),
          })
          .where(eq(sales.id, saleId));

        await tx
          .update(properties)
          .set({
            bookingStatus: 'Available',
            saleStatus: 'Unsold',
            updatedAt: new Date(),
          })
          .where(eq(properties.id, sale.propertyId));

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CANCEL_SALE',
          'sale',
          saleId,
          `Cancelled sale ${sale.invoiceNumber}: ${reason}`
        );
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Cancel sale error:', error);
      res.status(400).json({ error: error.message || 'Failed to cancel sale' });
    }
  }
);

// Installments
salesRouter.get('/installments', async (_req: AuthRequest, res) => {
  try {
    await db.transaction(async (tx) => {
      await syncInstallmentStatuses(tx);
    });

    const [instRows, saleRows, custRows, propRows] = await Promise.all([
      db.select().from(installments).orderBy(asc(installments.dueDate), asc(installments.installmentNumber)),
      db.select().from(sales),
      db.select().from(customers),
      db.select().from(properties),
    ]);

    const saleMap = new Map(saleRows.map((s) => [s.id, s]));
    const custMap = new Map(custRows.map((c) => [c.id, c]));
    const propMap = new Map(propRows.map((p) => [p.id, p]));

    const enriched = instRows.map((i) => ({
      ...i,
      sale: saleMap.get(i.saleId) || null,
      customer: custMap.get(i.customerId) || null,
      property: propMap.get(i.propertyId) || null,
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Fetch installments error:', error);
    res.status(500).json({ error: 'Failed to load installments' });
  }
});

salesRouter.post(
  '/installments/reschedule',
  requireRole(['admin', 'accounts', 'recovery']),
  async (req: AuthRequest, res) => {
    try {
      const { installmentId, dueDate, installmentAmount, lateFee, remarks } = req.body;
      if (!installmentId) {
        return res.status(400).json({ error: 'Installment ID is required.' });
      }

      const updated = await db.transaction(async (tx) => {
        const existingRows = await tx
          .select()
          .from(installments)
          .where(eq(installments.id, Number(installmentId)))
          .limit(1);
        const cur = existingRows[0];
        if (!cur) throw new Error('Installment not found.');
        if (cur.status === 'Paid' || cur.status === 'Cancelled') {
          throw new Error('Cannot modify a Paid or Cancelled installment.');
        }

        const nextAmt =
          installmentAmount !== undefined
            ? roundMoney(Number(installmentAmount))
            : Number(cur.installmentAmount);
        const paid = Number(cur.paidAmount);
        if (nextAmt < paid) {
          throw new Error('Installment amount cannot be less than already paid amount.');
        }
        const nextLateFee =
          lateFee !== undefined ? roundMoney(Number(lateFee)) : Number(cur.lateFee);
        const nextRemaining = roundMoney(nextAmt - paid);
        const nextDueDate = dueDate || cur.dueDate;
        const today = new Date().toISOString().slice(0, 10);
        const nextStatus =
          nextRemaining <= 0.005
            ? 'Paid'
            : nextDueDate < today
            ? 'Overdue'
            : paid > 0
            ? 'Partially Paid'
            : nextDueDate === today
            ? 'Due'
            : 'Upcoming';

        const [row] = await tx
          .update(installments)
          .set({
            dueDate: nextDueDate,
            installmentAmount: formatMoneyStr(nextAmt),
            lateFee: formatMoneyStr(nextLateFee),
            remainingAmount: formatMoneyStr(nextRemaining),
            status: nextStatus,
            remarks: remarks !== undefined ? String(remarks) : cur.remarks,
            updatedAt: new Date(),
          })
          .where(eq(installments.id, cur.id))
          .returning();

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'RESCHEDULE_INSTALLMENT',
          'installment',
          cur.id,
          `Modified installment #${cur.installmentNumber} (Sale ID ${cur.saleId}): Due ${cur.dueDate}->${nextDueDate}, Amt ${cur.installmentAmount}->${nextAmt}`
        );

        return row;
      });

      res.json(updated);
    } catch (error: any) {
      console.error('Reschedule installment error:', error);
      res.status(400).json({ error: error.message || 'Failed to reschedule installment' });
    }
  }
);
