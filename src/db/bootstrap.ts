import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { accounts, companySettings } from './schema.ts';

interface AccountSeed {
  code: string;
  name: string;
  parentCode: string | null;
  accountType: 'ASSET' | 'LIABILITY' | 'CAPITAL' | 'INCOME' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
  isSystem: boolean;
}

const DEFAULT_COA: AccountSeed[] = [
  // Level 1 Roots
  { code: '1000', name: 'ASSETS', parentCode: null, accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },
  { code: '2000', name: 'LIABILITIES', parentCode: null, accountType: 'LIABILITY', normalBalance: 'CREDIT', isSystem: true },
  { code: '3000', name: 'CAPITAL', parentCode: null, accountType: 'CAPITAL', normalBalance: 'CREDIT', isSystem: true },
  { code: '4000', name: 'INCOME', parentCode: null, accountType: 'INCOME', normalBalance: 'CREDIT', isSystem: true },
  { code: '5000', name: 'EXPENSES', parentCode: null, accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },

  // Level 2 - ASSETS
  { code: '1100', name: 'Cash in Hand', parentCode: '1000', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },
  { code: '1200', name: 'Bank Accounts', parentCode: '1000', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },
  { code: '1201', name: 'Main Society Bank Account', parentCode: '1200', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },
  { code: '1300', name: 'Customer Receivables', parentCode: '1000', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },
  { code: '1400', name: 'Installment Receivables', parentCode: '1000', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },
  { code: '1500', name: 'Other Receivables', parentCode: '1000', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },
  { code: '1600', name: 'Fixed Assets', parentCode: '1000', accountType: 'ASSET', normalBalance: 'DEBIT', isSystem: true },

  // Level 2 - LIABILITIES
  { code: '2100', name: 'Accounts Payable', parentCode: '2000', accountType: 'LIABILITY', normalBalance: 'CREDIT', isSystem: true },
  { code: '2200', name: 'Customer Advances', parentCode: '2000', accountType: 'LIABILITY', normalBalance: 'CREDIT', isSystem: true },
  { code: '2300', name: 'Deferred Installment Revenue', parentCode: '2000', accountType: 'LIABILITY', normalBalance: 'CREDIT', isSystem: true },
  { code: '2400', name: 'Security Deposits', parentCode: '2000', accountType: 'LIABILITY', normalBalance: 'CREDIT', isSystem: true },
  { code: '2500', name: 'Other Liabilities', parentCode: '2000', accountType: 'LIABILITY', normalBalance: 'CREDIT', isSystem: true },

  // Level 2 - CAPITAL
  { code: '3100', name: 'Owner Capital', parentCode: '3000', accountType: 'CAPITAL', normalBalance: 'CREDIT', isSystem: true },
  { code: '3200', name: 'Retained Earnings', parentCode: '3000', accountType: 'CAPITAL', normalBalance: 'CREDIT', isSystem: true },

  // Level 2 - INCOME
  { code: '4100', name: 'Plot Sales Income', parentCode: '4000', accountType: 'INCOME', normalBalance: 'CREDIT', isSystem: true },
  { code: '4200', name: 'Shop Sales Income', parentCode: '4000', accountType: 'INCOME', normalBalance: 'CREDIT', isSystem: true },
  { code: '4300', name: 'Late Payment Charges', parentCode: '4000', accountType: 'INCOME', normalBalance: 'CREDIT', isSystem: true },
  { code: '4400', name: 'Other Income', parentCode: '4000', accountType: 'INCOME', normalBalance: 'CREDIT', isSystem: true },

  // Level 2 - EXPENSES
  { code: '5100', name: 'Salaries', parentCode: '5000', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },
  { code: '5200', name: 'Office Rent', parentCode: '5000', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },
  { code: '5300', name: 'Electricity & Utilities', parentCode: '5000', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },
  { code: '5400', name: 'Marketing Expenses', parentCode: '5000', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },
  { code: '5500', name: 'Development Expenses', parentCode: '5000', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },
  { code: '5600', name: 'Administrative Expenses', parentCode: '5000', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },
  { code: '5700', name: 'Other Expenses', parentCode: '5000', accountType: 'EXPENSE', normalBalance: 'DEBIT', isSystem: true },
];

let bootstrapped = false;

export async function ensureSystemBootstrap() {
  if (bootstrapped) return;
  try {
    const existingSettings = await db.select().from(companySettings).limit(1);
    if (existingSettings.length === 0) {
      await db.insert(companySettings).values({
        companyName: 'HAMA NAGAR',
        subtitle: 'Housing Society – Plot & Shop Sales Management',
        address: 'Main Vehari Road, Punjab, Pakistan',
        phone: '+92 300 0000000',
        currency: 'PKR',
        invoicePrefix: 'INV',
        crvPrefix: 'CRV',
        cpvPrefix: 'CPV',
        jvPrefix: 'JV',
        printFooter: 'Powered by: Prime Soft Vehari',
      });
    }

    const existingAccounts = await db.select().from(accounts).limit(1);
    if (existingAccounts.length === 0) {
      const codeToId = new Map<string, number>();
      for (const acc of DEFAULT_COA) {
        const parentId = acc.parentCode ? codeToId.get(acc.parentCode) ?? null : null;
        const [inserted] = await db
          .insert(accounts)
          .values({
            code: acc.code,
            name: acc.name,
            parentId,
            accountType: acc.accountType,
            normalBalance: acc.normalBalance,
            openingBalance: '0.00',
            isSystem: acc.isSystem,
            isActive: true,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted) {
          codeToId.set(acc.code, inserted.id);
        } else {
          const found = await db
            .select()
            .from(accounts)
            .where(eq(accounts.code, acc.code))
            .limit(1);
          if (found[0]) codeToId.set(acc.code, found[0].id);
        }
      }
    }
    bootstrapped = true;
  } catch (err) {
    console.error('Bootstrap initialization error:', err);
  }
}
