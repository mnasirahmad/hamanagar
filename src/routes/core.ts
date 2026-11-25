import { Router } from 'express';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  accounts,
  auditLogs,
  companySettings,
  customers,
  installmentAllocations,
  installments,
  ledgerEntries,
  properties,
  sales,
  users,
  vouchers,
} from '../db/schema.ts';
import { ensureSystemBootstrap } from '../db/bootstrap.ts';
import { requireRole, type AuthRequest } from '../middleware/auth.ts';
import { logAudit, roundMoney, syncInstallmentStatuses } from '../services/accounting.ts';

export const coreRouter = Router();

coreRouter.get('/me', async (req: AuthRequest, res) => {
  try {
    await ensureSystemBootstrap();
    const settingsRows = await db.select().from(companySettings).limit(1);
    res.json({
      user: req.dbUser,
      settings: settingsRows[0] || null,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to load user profile' });
  }
});

coreRouter.get('/dashboard', async (_req: AuthRequest, res) => {
  try {
    await ensureSystemBootstrap();
    await db.transaction(async (tx) => {
      await syncInstallmentStatuses(tx);
    });

    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);

    const [
      allProperties,
      allCustomers,
      allSales,
      allInstallments,
      allVouchers,
      allAccounts,
      allLedger,
    ] = await Promise.all([
      db.select().from(properties),
      db.select().from(customers),
      db.select().from(sales),
      db.select().from(installments),
      db.select().from(vouchers),
      db.select().from(accounts),
      db.select().from(ledgerEntries),
    ]);

    const totalPlots = allProperties.filter((p) => p.category !== 'Shop').length;
    const totalShops = allProperties.filter((p) => p.category === 'Shop').length;
    const availableProperties = allProperties.filter((p) => p.bookingStatus === 'Available').length;
    const bookedProperties = allProperties.filter((p) => p.bookingStatus === 'Booked' || p.bookingStatus === 'Reserved').length;
    const soldProperties = allProperties.filter((p) => p.bookingStatus === 'Sold').length;

    const activeSales = allSales.filter((s) => s.status !== 'Cancelled');
    const totalSalesAmount = roundMoney(
      activeSales.reduce((acc, s) => acc + Number(s.netSaleAmount), 0)
    );
    const totalCashSales = roundMoney(
      activeSales
        .filter((s) => s.saleType === 'CASH')
        .reduce((acc, s) => acc + Number(s.netSaleAmount), 0)
    );
    const totalInstallmentSales = roundMoney(
      activeSales
        .filter((s) => s.saleType === 'INSTALLMENT')
        .reduce((acc, s) => acc + Number(s.netSaleAmount), 0)
    );

    const activeVouchers = allVouchers.filter((v) => v.status === 'Posted');
    const totalAmountReceived = roundMoney(
      activeVouchers
        .filter((v) => v.voucherType === 'CRV')
        .reduce((acc, v) => acc + Number(v.totalAmount), 0)
    );

    const activeInstallments = allInstallments.filter((i) => i.status !== 'Cancelled');
    const totalPendingRecoveries = roundMoney(
      activeInstallments.reduce((acc, i) => acc + Number(i.remainingAmount), 0)
    );
    const monthlyInstallmentRecovery = roundMoney(
      activeVouchers
        .filter(
          (v) =>
            v.voucherType === 'CRV' &&
            v.voucherDate.startsWith(currentMonth)
        )
        .reduce((acc, v) => acc + Number(v.totalAmount), 0)
    );
    const overdueInstallmentsList = activeInstallments.filter((i) => i.status === 'Overdue');
    const overdueInstallmentsCount = overdueInstallmentsList.length;
    const overdueInstallmentsAmount = roundMoney(
      overdueInstallmentsList.reduce((acc, i) => acc + Number(i.remainingAmount), 0)
    );

    const todaysCashReceipts = roundMoney(
      activeVouchers
        .filter((v) => v.voucherType === 'CRV' && v.voucherDate === today)
        .reduce((acc, v) => acc + Number(v.totalAmount), 0)
    );
    const todaysCashPayments = roundMoney(
      activeVouchers
        .filter((v) => v.voucherType === 'CPV' && v.voucherDate === today)
        .reduce((acc, v) => acc + Number(v.totalAmount), 0)
    );

    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
    const activeVoucherIds = new Set(activeVouchers.map((v) => v.id));

    let monthlyIncome = 0;
    let monthlyExpenses = 0;
    for (const le of allLedger) {
      if (!activeVoucherIds.has(le.voucherId)) continue;
      if (!le.entryDate.startsWith(currentMonth)) continue;
      const acc = accountMap.get(le.accountId);
      if (!acc) continue;
      if (acc.accountType === 'INCOME') {
        monthlyIncome = roundMoney(monthlyIncome + Number(le.credit) - Number(le.debit));
      } else if (acc.accountType === 'EXPENSE') {
        monthlyExpenses = roundMoney(monthlyExpenses + Number(le.debit) - Number(le.credit));
      }
    }

    // Build last 6 months series
    const months: string[] = [];
    const now = new Date();
    for (let idx = 5; idx >= 0; idx--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - idx, 1));
      months.push(d.toISOString().slice(0, 7));
    }

    const monthlySeries = months.map((m) => {
      const salesAmt = roundMoney(
        activeSales
          .filter((s) => s.saleDate.startsWith(m))
          .reduce((acc, s) => acc + Number(s.netSaleAmount), 0)
      );
      const recoveryAmt = roundMoney(
        activeVouchers
          .filter((v) => v.voucherType === 'CRV' && v.voucherDate.startsWith(m))
          .reduce((acc, v) => acc + Number(v.totalAmount), 0)
      );
      const paymentAmt = roundMoney(
        activeVouchers
          .filter((v) => v.voucherType === 'CPV' && v.voucherDate.startsWith(m))
          .reduce((acc, v) => acc + Number(v.totalAmount), 0)
      );
      const pendingDueAmt = roundMoney(
        activeInstallments
          .filter((i) => i.dueDate.startsWith(m))
          .reduce((acc, i) => acc + Number(i.remainingAmount), 0)
      );
      return {
        month: m,
        sales: salesAmt,
        recoveries: recoveryAmt,
        payments: paymentAmt,
        pending: pendingDueAmt,
      };
    });

    const recentVouchers = [...allVouchers]
      .sort((a, b) => b.id - a.id)
      .slice(0, 8);

    res.json({
      kpis: {
        totalPlots,
        totalShops,
        availableProperties,
        bookedProperties,
        soldProperties,
        totalSalesAmount,
        totalCashSales,
        totalInstallmentSales,
        totalAmountReceived,
        totalPendingRecoveries,
        monthlyInstallmentRecovery,
        overdueInstallmentsCount,
        overdueInstallmentsAmount,
        totalCustomers: allCustomers.length,
        todaysCashReceipts,
        todaysCashPayments,
        monthlyIncome,
        monthlyExpenses,
      },
      monthlySeries,
      propertyBreakdown: {
        Available: availableProperties,
        Reserved: allProperties.filter((p) => p.bookingStatus === 'Reserved').length,
        Booked: allProperties.filter((p) => p.bookingStatus === 'Booked').length,
        Sold: soldProperties,
        Cancelled: allProperties.filter((p) => p.bookingStatus === 'Cancelled').length,
        Transferred: allProperties.filter((p) => p.bookingStatus === 'Transferred').length,
      },
      recentVouchers,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
});

// Properties CRUD
coreRouter.get('/properties', async (req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(properties).orderBy(asc(properties.propertyNumber));
    res.json(rows);
  } catch (error) {
    console.error('Error loading properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

coreRouter.post(
  '/properties',
  requireRole(['admin', 'sales']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      if (!b.propertyNumber || !b.block || !b.category || !b.sizeValue || !b.totalPrice) {
        return res.status(400).json({ error: 'Property number, block, category, size, and total price are required.' });
      }
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(properties)
          .values({
            propertyNumber: String(b.propertyNumber).trim(),
            block: String(b.block).trim(),
            streetNumber: String(b.streetNumber || '').trim(),
            category: String(b.category).trim(),
            sizeValue: String(Number(b.sizeValue).toFixed(2)),
            sizeUnit: String(b.sizeUnit || 'Marla').trim(),
            location: String(b.location || '').trim(),
            totalPrice: String(Number(b.totalPrice).toFixed(2)),
            bookingStatus: String(b.bookingStatus || 'Available'),
            saleStatus: String(b.saleStatus || 'Unsold'),
            remarks: String(b.remarks || '').trim(),
          })
          .returning();
        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CREATE_PROPERTY',
          'property',
          row.id,
          `Added property ${row.propertyNumber} (${row.category})`
        );
        return row;
      });
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Create property error:', error);
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'Property Number / Plot Number already exists.' });
      }
      res.status(500).json({ error: 'Failed to create property' });
    }
  }
);

coreRouter.put(
  '/properties/:id',
  requireRole(['admin', 'sales']),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const b = req.body;
      const updated = await db.transaction(async (tx) => {
        const existing = await tx.select().from(properties).where(eq(properties.id, id)).limit(1);
        if (!existing[0]) {
          throw new Error('NOT_FOUND');
        }
        const [row] = await tx
          .update(properties)
          .set({
            propertyNumber: b.propertyNumber !== undefined ? String(b.propertyNumber).trim() : existing[0].propertyNumber,
            block: b.block !== undefined ? String(b.block).trim() : existing[0].block,
            streetNumber: b.streetNumber !== undefined ? String(b.streetNumber).trim() : existing[0].streetNumber,
            category: b.category !== undefined ? String(b.category).trim() : existing[0].category,
            sizeValue: b.sizeValue !== undefined ? String(Number(b.sizeValue).toFixed(2)) : existing[0].sizeValue,
            sizeUnit: b.sizeUnit !== undefined ? String(b.sizeUnit).trim() : existing[0].sizeUnit,
            location: b.location !== undefined ? String(b.location).trim() : existing[0].location,
            totalPrice: b.totalPrice !== undefined ? String(Number(b.totalPrice).toFixed(2)) : existing[0].totalPrice,
            bookingStatus: b.bookingStatus !== undefined ? String(b.bookingStatus) : existing[0].bookingStatus,
            saleStatus: b.saleStatus !== undefined ? String(b.saleStatus) : existing[0].saleStatus,
            remarks: b.remarks !== undefined ? String(b.remarks).trim() : existing[0].remarks,
            updatedAt: new Date(),
          })
          .where(eq(properties.id, id))
          .returning();
        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'UPDATE_PROPERTY',
          'property',
          id,
          `Updated property ${row.propertyNumber}`
        );
        return row;
      });
      res.json(updated);
    } catch (error: any) {
      if (error.message === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Property not found' });
      }
      console.error('Update property error:', error);
      res.status(500).json({ error: 'Failed to update property' });
    }
  }
);

coreRouter.delete(
  '/properties/:id',
  requireRole(['admin']),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const linkedSales = await db.select().from(sales).where(eq(sales.propertyId, id)).limit(1);
      if (linkedSales.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete a property linked to existing sales records.',
        });
      }
      await db.transaction(async (tx) => {
        await tx.delete(properties).where(eq(properties.id, id));
        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'DELETE_PROPERTY',
          'property',
          id,
          `Deleted property ID ${id}`
        );
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete property error:', error);
      res.status(500).json({ error: 'Failed to delete property' });
    }
  }
);

// Customers CRUD & History
coreRouter.get('/customers', async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(customers).orderBy(desc(customers.id));
    res.json(rows);
  } catch (error) {
    console.error('Load customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

coreRouter.post(
  '/customers',
  requireRole(['admin', 'sales']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      if (!b.fullName || !b.guardianName || !b.cnic || !b.mobile || !b.address) {
        return res.status(400).json({
          error: 'Customer Name, Father/Husband Name, CNIC, Mobile, and Address are required.',
        });
      }

      const created = await db.transaction(async (tx) => {
        const allCodes = await tx.select({ customerCode: customers.customerCode }).from(customers);
        let maxSeq = 0;
        for (const r of allCodes) {
          const num = parseInt(r.customerCode.replace('CUST-', ''), 10);
          if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
        }
        const customerCode = `CUST-${String(maxSeq + 1).padStart(4, '0')}`;
        const regDate = b.registrationDate || new Date().toISOString().slice(0, 10);

        const [row] = await tx
          .insert(customers)
          .values({
            customerCode,
            fullName: String(b.fullName).trim(),
            guardianName: String(b.guardianName).trim(),
            cnic: String(b.cnic).trim(),
            mobile: String(b.mobile).trim(),
            whatsapp: String(b.whatsapp || b.mobile).trim(),
            address: String(b.address).trim(),
            city: String(b.city || 'Vehari').trim(),
            nomineeName: String(b.nomineeName || '').trim(),
            nomineeCnic: String(b.nomineeCnic || '').trim(),
            registrationDate: regDate,
            remarks: String(b.remarks || '').trim(),
            createdByUid: req.dbUser?.uid || null,
          })
          .returning();

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'CREATE_CUSTOMER',
          'customer',
          row.id,
          `Registered customer ${row.customerCode} - ${row.fullName}`
        );
        return row;
      });
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'A customer with this CNIC already exists.' });
      }
      console.error('Create customer error:', error);
      res.status(500).json({ error: 'Failed to register customer' });
    }
  }
);

coreRouter.put(
  '/customers/:id',
  requireRole(['admin', 'sales']),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const b = req.body;
      const updated = await db.transaction(async (tx) => {
        const existing = await tx.select().from(customers).where(eq(customers.id, id)).limit(1);
        if (!existing[0]) throw new Error('NOT_FOUND');
        const cur = existing[0];
        const [row] = await tx
          .update(customers)
          .set({
            fullName: b.fullName !== undefined ? String(b.fullName).trim() : cur.fullName,
            guardianName: b.guardianName !== undefined ? String(b.guardianName).trim() : cur.guardianName,
            cnic: b.cnic !== undefined ? String(b.cnic).trim() : cur.cnic,
            mobile: b.mobile !== undefined ? String(b.mobile).trim() : cur.mobile,
            whatsapp: b.whatsapp !== undefined ? String(b.whatsapp).trim() : cur.whatsapp,
            address: b.address !== undefined ? String(b.address).trim() : cur.address,
            city: b.city !== undefined ? String(b.city).trim() : cur.city,
            nomineeName: b.nomineeName !== undefined ? String(b.nomineeName).trim() : cur.nomineeName,
            nomineeCnic: b.nomineeCnic !== undefined ? String(b.nomineeCnic).trim() : cur.nomineeCnic,
            registrationDate: b.registrationDate !== undefined ? String(b.registrationDate) : cur.registrationDate,
            remarks: b.remarks !== undefined ? String(b.remarks).trim() : cur.remarks,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, id))
          .returning();
        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'UPDATE_CUSTOMER',
          'customer',
          id,
          `Updated customer ${row.customerCode} - ${row.fullName}`
        );
        return row;
      });
      res.json(updated);
    } catch (error: any) {
      if (error.message === 'NOT_FOUND') {
        return res.status(404).json({ error: 'Customer not found' });
      }
      console.error('Update customer error:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  }
);

coreRouter.get('/customers/:id/history', async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [customerRows, customerSales, customerInstallments, customerVouchers, allProps] =
      await Promise.all([
        db.select().from(customers).where(eq(customers.id, id)).limit(1),
        db.select().from(sales).where(eq(sales.customerId, id)).orderBy(desc(sales.id)),
        db
          .select()
          .from(installments)
          .where(eq(installments.customerId, id))
          .orderBy(asc(installments.installmentNumber)),
        db.select().from(vouchers).where(eq(vouchers.customerId, id)).orderBy(desc(vouchers.id)),
        db.select().from(properties),
      ]);

    if (!customerRows[0]) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const propMap = new Map(allProps.map((p) => [p.id, p]));

    const activeSales = customerSales.filter((s) => s.status !== 'Cancelled');
    const totalPurchased = roundMoney(
      activeSales.reduce((acc, s) => acc + Number(s.netSaleAmount), 0)
    );
    const totalPaid = roundMoney(
      customerVouchers
        .filter((v) => v.status === 'Posted' && v.voucherType === 'CRV')
        .reduce((acc, v) => acc + Number(v.totalAmount), 0)
    );
    const outstandingBalance = roundMoney(
      customerInstallments
        .filter((i) => i.status !== 'Cancelled')
        .reduce((acc, i) => acc + Number(i.remainingAmount), 0)
    );

    res.json({
      customer: customerRows[0],
      sales: customerSales.map((s) => ({
        ...s,
        property: propMap.get(s.propertyId) || null,
      })),
      installments: customerInstallments.map((i) => ({
        ...i,
        property: propMap.get(i.propertyId) || null,
      })),
      vouchers: customerVouchers,
      summary: {
        totalPurchased,
        totalPaid,
        outstandingBalance,
      },
    });
  } catch (error) {
    console.error('Customer history error:', error);
    res.status(500).json({ error: 'Failed to load customer history' });
  }
});

// Company Settings
coreRouter.get('/settings', async (_req: AuthRequest, res) => {
  try {
    await ensureSystemBootstrap();
    const rows = await db.select().from(companySettings).limit(1);
    res.json(rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

coreRouter.put(
  '/settings',
  requireRole(['admin']),
  async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const updated = await db.transaction(async (tx) => {
        const rows = await tx.select().from(companySettings).limit(1);
        if (!rows[0]) throw new Error('Settings missing');
        const cur = rows[0];
        const [row] = await tx
          .update(companySettings)
          .set({
            companyName: b.companyName ?? cur.companyName,
            subtitle: b.subtitle ?? cur.subtitle,
            address: b.address ?? cur.address,
            phone: b.phone ?? cur.phone,
            logoUrl: b.logoUrl ?? cur.logoUrl,
            financialYearStart: b.financialYearStart ?? cur.financialYearStart,
            financialYearEnd: b.financialYearEnd ?? cur.financialYearEnd,
            currency: b.currency ?? cur.currency,
            invoicePrefix: b.invoicePrefix ?? cur.invoicePrefix,
            crvPrefix: b.crvPrefix ?? cur.crvPrefix,
            cpvPrefix: b.cpvPrefix ?? cur.cpvPrefix,
            jvPrefix: b.jvPrefix ?? cur.jvPrefix,
            defaultInstallmentMonths:
              b.defaultInstallmentMonths !== undefined
                ? Number(b.defaultInstallmentMonths)
                : cur.defaultInstallmentMonths,
            lateFeePercent:
              b.lateFeePercent !== undefined
                ? Number(b.lateFeePercent).toFixed(2)
                : cur.lateFeePercent,
            gracePeriodDays:
              b.gracePeriodDays !== undefined
                ? Number(b.gracePeriodDays)
                : cur.gracePeriodDays,
            receiptTerms: b.receiptTerms ?? cur.receiptTerms,
            printFooter: b.printFooter ?? cur.printFooter,
            updatedAt: new Date(),
          })
          .where(eq(companySettings.id, cur.id))
          .returning();

        await logAudit(
          tx,
          req.dbUser?.uid || null,
          req.dbUser?.email || null,
          'UPDATE_SETTINGS',
          'company_settings',
          cur.id,
          'Updated company & ERP configuration'
        );
        return row;
      });
      res.json(updated);
    } catch (error) {
      console.error('Settings update error:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }
);

// Users & Audit Logs (Admin)
coreRouter.get('/users', requireRole(['admin']), async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(users).orderBy(asc(users.id));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

coreRouter.put('/users/:id', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { role, isActive, fullName } = req.body;
    const validRoles = ['admin', 'accounts', 'sales', 'recovery', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role selected.' });
    }
    const updated = await db.transaction(async (tx) => {
      const existing = await tx.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing[0]) throw new Error('NOT_FOUND');
      const [row] = await tx
        .update(users)
        .set({
          role: role ?? existing[0].role,
          isActive: isActive !== undefined ? Boolean(isActive) : existing[0].isActive,
          fullName: fullName !== undefined ? String(fullName).trim() : existing[0].fullName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      await logAudit(
        tx,
        req.dbUser?.uid || null,
        req.dbUser?.email || null,
        'UPDATE_USER_ROLE',
        'user',
        id,
        `Updated user ${row.email} role=${row.role} active=${row.isActive}`
      );
      return row;
    });
    res.json(updated);
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

coreRouter.get('/audit-logs', requireRole(['admin']), async (_req: AuthRequest, res) => {
  try {
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(250);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Database Backup & Restore (Admin)
coreRouter.get('/backup', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const [
      settingsRows,
      accountRows,
      propertyRows,
      customerRows,
      saleRows,
      installmentRows,
      voucherRows,
      ledgerRows,
      allocationRows,
    ] = await Promise.all([
      db.select().from(companySettings),
      db.select().from(accounts).orderBy(asc(accounts.id)),
      db.select().from(properties).orderBy(asc(properties.id)),
      db.select().from(customers).orderBy(asc(customers.id)),
      db.select().from(sales).orderBy(asc(sales.id)),
      db.select().from(installments).orderBy(asc(installments.id)),
      db.select().from(vouchers).orderBy(asc(vouchers.id)),
      db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.id)),
      db.select().from(installmentAllocations).orderBy(asc(installmentAllocations.id)),
    ]);

    await db.transaction(async (tx) => {
      await logAudit(
        tx,
        req.dbUser?.uid || null,
        req.dbUser?.email || null,
        'DATABASE_BACKUP',
        'system',
        'backup',
        'Exported full JSON database backup'
      );
    });

    res.json({
      exportedAt: new Date().toISOString(),
      application: 'HAMA NAGAR ERP',
      version: '1.0',
      data: {
        companySettings: settingsRows,
        accounts: accountRows,
        properties: propertyRows,
        customers: customerRows,
        sales: saleRows,
        installments: installmentRows,
        vouchers: voucherRows,
        ledgerEntries: ledgerRows,
        installmentAllocations: allocationRows,
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Failed to generate database backup' });
  }
});

coreRouter.post('/restore', requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const payload = req.body?.data;
    if (!payload || !Array.isArray(payload.accounts)) {
      return res.status(400).json({ error: 'Invalid backup file format.' });
    }

    await db.transaction(async (tx) => {
      // Clear transactional & master tables in FK-safe order
      await tx.delete(installmentAllocations);
      await tx.delete(ledgerEntries);
      await tx.delete(vouchers);
      await tx.delete(installments);
      await tx.delete(sales);
      await tx.delete(customers);
      await tx.delete(properties);
      await tx.delete(accounts);
      await tx.delete(companySettings);

      if (payload.companySettings?.length) {
        await tx.insert(companySettings).values(
          payload.companySettings.map((r: any) => ({ ...r, updatedAt: new Date() }))
        );
      }
      if (payload.accounts?.length) {
        await tx.insert(accounts).values(
          payload.accounts.map((r: any) => ({ ...r, createdAt: new Date(r.createdAt || Date.now()) }))
        );
      }
      if (payload.properties?.length) {
        await tx.insert(properties).values(
          payload.properties.map((r: any) => ({
            ...r,
            createdAt: new Date(r.createdAt || Date.now()),
            updatedAt: new Date(),
          }))
        );
      }
      if (payload.customers?.length) {
        await tx.insert(customers).values(
          payload.customers.map((r: any) => ({
            ...r,
            createdByUid: null,
            createdAt: new Date(r.createdAt || Date.now()),
            updatedAt: new Date(),
          }))
        );
      }
      if (payload.sales?.length) {
        await tx.insert(sales).values(
          payload.sales.map((r: any) => ({
            ...r,
            createdByUid: null,
            createdAt: new Date(r.createdAt || Date.now()),
            updatedAt: new Date(),
          }))
        );
      }
      if (payload.installments?.length) {
        await tx.insert(installments).values(
          payload.installments.map((r: any) => ({ ...r, updatedAt: new Date() }))
        );
      }
      if (payload.vouchers?.length) {
        await tx.insert(vouchers).values(
          payload.vouchers.map((r: any) => ({
            ...r,
            createdByUid: null,
            createdAt: new Date(r.createdAt || Date.now()),
          }))
        );
      }
      if (payload.ledgerEntries?.length) {
        await tx.insert(ledgerEntries).values(
          payload.ledgerEntries.map((r: any) => ({
            ...r,
            createdAt: new Date(r.createdAt || Date.now()),
          }))
        );
      }
      if (payload.installmentAllocations?.length) {
        await tx.insert(installmentAllocations).values(
          payload.installmentAllocations.map((r: any) => ({
            ...r,
            createdAt: new Date(r.createdAt || Date.now()),
          }))
        );
      }

      // Reset sequences
      const tables = [
        'company_settings',
        'accounts',
        'properties',
        'customers',
        'sales',
        'installments',
        'vouchers',
        'ledger_entries',
        'installment_allocations',
      ];
      for (const t of tables) {
        await tx.execute(
          sql.raw(
            `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), true);`
          )
        );
      }

      await logAudit(
        tx,
        req.dbUser?.uid || null,
        req.dbUser?.email || null,
        'DATABASE_RESTORE',
        'system',
        'restore',
        `Restored database from backup exported at ${req.body.exportedAt || 'unknown'}`
      );
    });

    res.json({ success: true, message: 'Database restored successfully.' });
  } catch (error) {
    console.error('Restore error:', error);
    res.status(500).json({ error: 'Database restore failed. Transaction rolled back safely.' });
  }
});
