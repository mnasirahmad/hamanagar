import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull().default('User'),
  role: text('role').notNull().default('viewer'), // admin | accounts | sales | recovery | viewer
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const companySettings = pgTable('company_settings', {
  id: serial('id').primaryKey(),
  companyName: text('company_name').notNull().default('HAMA NAGAR'),
  subtitle: text('subtitle').notNull().default('Housing Society – Plot & Shop Sales Management'),
  address: text('address').notNull().default('Main Vehari Road, Punjab, Pakistan'),
  phone: text('phone').notNull().default('+92 300 0000000'),
  logoUrl: text('logo_url').notNull().default(''),
  financialYearStart: text('financial_year_start').notNull().default('2026-07-01'),
  financialYearEnd: text('financial_year_end').notNull().default('2027-06-30'),
  currency: text('currency').notNull().default('PKR'),
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  crvPrefix: text('crv_prefix').notNull().default('CRV'),
  cpvPrefix: text('cpv_prefix').notNull().default('CPV'),
  jvPrefix: text('jv_prefix').notNull().default('JV'),
  defaultInstallmentMonths: integer('default_installment_months').notNull().default(36),
  lateFeePercent: numeric('late_fee_percent', { precision: 5, scale: 2 }).notNull().default('2.00'),
  gracePeriodDays: integer('grace_period_days').notNull().default(10),
  receiptTerms: text('receipt_terms')
    .notNull()
    .default('All payments are subject to society bylaws and bank clearance. Official computer-generated document.'),
  printFooter: text('print_footer').notNull().default('Powered by: Prime Soft Vehari'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  parentId: integer('parent_id'),
  accountType: text('account_type').notNull(), // ASSET | LIABILITY | CAPITAL | INCOME | EXPENSE
  normalBalance: text('normal_balance').notNull(), // DEBIT | CREDIT
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }).notNull().default('0.00'),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const properties = pgTable('properties', {
  id: serial('id').primaryKey(),
  propertyNumber: text('property_number').notNull().unique(),
  block: text('block').notNull(),
  streetNumber: text('street_number').notNull().default(''),
  category: text('category').notNull(), // Residential Plot | Commercial Plot | Shop | Other
  sizeValue: numeric('size_value', { precision: 10, scale: 2 }).notNull(),
  sizeUnit: text('size_unit').notNull().default('Marla'), // Marla | Kanal | Sq Ft
  location: text('location').notNull().default(''),
  totalPrice: numeric('total_price', { precision: 14, scale: 2 }).notNull(),
  bookingStatus: text('booking_status').notNull().default('Available'), // Available | Reserved | Booked | Sold | Cancelled | Transferred
  saleStatus: text('sale_status').notNull().default('Unsold'), // Unsold | Installment | Cash Sold | Cancelled
  remarks: text('remarks').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  customerCode: text('customer_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  guardianName: text('guardian_name').notNull(),
  cnic: text('cnic').notNull().unique(),
  mobile: text('mobile').notNull(),
  whatsapp: text('whatsapp').notNull().default(''),
  address: text('address').notNull(),
  city: text('city').notNull().default('Vehari'),
  nomineeName: text('nominee_name').notNull().default(''),
  nomineeCnic: text('nominee_cnic').notNull().default(''),
  registrationDate: text('registration_date').notNull(),
  remarks: text('remarks').notNull().default(''),
  createdByUid: text('created_by_uid').references(() => users.uid),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  saleType: text('sale_type').notNull(), // INSTALLMENT | CASH
  saleDate: text('sale_date').notNull(),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  propertyId: integer('property_id')
    .notNull()
    .references(() => properties.id),
  totalPrice: numeric('total_price', { precision: 14, scale: 2 }).notNull(),
  discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0.00'),
  netSaleAmount: numeric('net_sale_amount', { precision: 14, scale: 2 }).notNull(),
  bookingAmount: numeric('booking_amount', { precision: 14, scale: 2 }).notNull().default('0.00'),
  downPayment: numeric('down_payment', { precision: 14, scale: 2 }).notNull().default('0.00'),
  remainingAmount: numeric('remaining_amount', { precision: 14, scale: 2 }).notNull().default('0.00'),
  durationMonths: integer('duration_months').notNull().default(0),
  monthlyInstallment: numeric('monthly_installment', { precision: 14, scale: 2 }).notNull().default('0.00'),
  firstInstallmentDate: text('first_installment_date').notNull().default(''),
  dueDay: integer('due_day').notNull().default(10),
  paymentFrequency: text('payment_frequency').notNull().default('Monthly'),
  paymentMethod: text('payment_method').notNull().default('Cash'),
  cashBankAccountId: integer('cash_bank_account_id').references(() => accounts.id),
  termsAndConditions: text('terms_and_conditions').notNull().default(''),
  remarks: text('remarks').notNull().default(''),
  status: text('status').notNull().default('Active'), // Active | Completed | Cancelled
  createdByUid: text('created_by_uid').references(() => users.uid),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const installments = pgTable('installments', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id')
    .notNull()
    .references(() => sales.id),
  customerId: integer('customer_id')
    .notNull()
    .references(() => customers.id),
  propertyId: integer('property_id')
    .notNull()
    .references(() => properties.id),
  installmentNumber: integer('installment_number').notNull(),
  dueDate: text('due_date').notNull(),
  installmentAmount: numeric('installment_amount', { precision: 14, scale: 2 }).notNull(),
  lateFee: numeric('late_fee', { precision: 14, scale: 2 }).notNull().default('0.00'),
  paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull().default('0.00'),
  remainingAmount: numeric('remaining_amount', { precision: 14, scale: 2 }).notNull(),
  paymentDate: text('payment_date').notNull().default(''),
  status: text('status').notNull().default('Upcoming'), // Upcoming | Due | Partially Paid | Paid | Overdue | Cancelled
  remarks: text('remarks').notNull().default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vouchers = pgTable('vouchers', {
  id: serial('id').primaryKey(),
  voucherNumber: text('voucher_number').notNull().unique(),
  voucherType: text('voucher_type').notNull(), // CRV | CPV | JV | SALE | REVERSAL
  voucherDate: text('voucher_date').notNull(),
  customerId: integer('customer_id').references(() => customers.id),
  propertyId: integer('property_id').references(() => properties.id),
  saleId: integer('sale_id').references(() => sales.id),
  cashBankAccountId: integer('cash_bank_account_id').references(() => accounts.id),
  partyName: text('party_name').notNull().default(''),
  receiptCategory: text('receipt_category').notNull().default(''),
  paymentMethod: text('payment_method').notNull().default('Cash'),
  referenceNo: text('reference_no').notNull().default(''),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
  narration: text('narration').notNull().default(''),
  status: text('status').notNull().default('Posted'), // Posted | Cancelled
  reversedVoucherId: integer('reversed_voucher_id'),
  createdByUid: text('created_by_uid').references(() => users.uid),
  approvedByUid: text('approved_by_uid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const ledgerEntries = pgTable('ledger_entries', {
  id: serial('id').primaryKey(),
  voucherId: integer('voucher_id')
    .notNull()
    .references(() => vouchers.id),
  entryDate: text('entry_date').notNull(),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  customerId: integer('customer_id').references(() => customers.id),
  propertyId: integer('property_id').references(() => properties.id),
  saleId: integer('sale_id').references(() => sales.id),
  installmentId: integer('installment_id').references(() => installments.id),
  debit: numeric('debit', { precision: 14, scale: 2 }).notNull().default('0.00'),
  credit: numeric('credit', { precision: 14, scale: 2 }).notNull().default('0.00'),
  narration: text('narration').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const installmentAllocations = pgTable('installment_allocations', {
  id: serial('id').primaryKey(),
  voucherId: integer('voucher_id')
    .notNull()
    .references(() => vouchers.id),
  installmentId: integer('installment_id')
    .notNull()
    .references(() => installments.id),
  amountApplied: numeric('amount_applied', { precision: 14, scale: 2 }).notNull(),
  lateFeeApplied: numeric('late_fee_applied', { precision: 14, scale: 2 }).notNull().default('0.00'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid'),
  userEmail: text('user_email'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: text('details').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  property: one(properties, { fields: [sales.propertyId], references: [properties.id] }),
  installments: many(installments),
}));

export const installmentsRelations = relations(installments, ({ one }) => ({
  sale: one(sales, { fields: [installments.saleId], references: [sales.id] }),
  customer: one(customers, { fields: [installments.customerId], references: [customers.id] }),
  property: one(properties, { fields: [installments.propertyId], references: [properties.id] }),
}));

export const vouchersRelations = relations(vouchers, ({ one, many }) => ({
  customer: one(customers, { fields: [vouchers.customerId], references: [customers.id] }),
  property: one(properties, { fields: [vouchers.propertyId], references: [properties.id] }),
  sale: one(sales, { fields: [vouchers.saleId], references: [sales.id] }),
  entries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  voucher: one(vouchers, { fields: [ledgerEntries.voucherId], references: [vouchers.id] }),
  account: one(accounts, { fields: [ledgerEntries.accountId], references: [accounts.id] }),
  customer: one(customers, { fields: [ledgerEntries.customerId], references: [customers.id] }),
  property: one(properties, { fields: [ledgerEntries.propertyId], references: [properties.id] }),
}));
