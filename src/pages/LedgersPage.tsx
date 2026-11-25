import React, { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToPDF, formatDateDisplay, formatPKR } from '../lib/formatters';
import { PrintDocumentModal } from '../components/PrintDocumentModal';

const LEDGER_MODES = [
  { id: 'general', label: 'General Ledger' },
  { id: 'customer', label: 'Customer Ledger' },
  { id: 'property', label: 'Property-Wise Ledger' },
  { id: 'account', label: 'Account-Wise Ledger' },
  { id: 'cash', label: 'Cash Book / Ledger' },
  { id: 'bank', label: 'Bank Book / Ledger' },
  { id: 'receivables', label: 'Receivables Ledger' },
  { id: 'income', label: 'Income Ledger' },
  { id: 'expense', label: 'Expense Ledger' },
  { id: 'trial_balance', label: 'Trial Balance' },
  { id: 'income_statement', label: 'Income Statement (P&L)' },
  { id: 'balance_sheet', label: 'Balance Sheet' },
];

export function LedgersPage() {
  const { apiFetch, settings } = useAuth();
  const [mode, setMode] = useState('general');
  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [accountId, setAccountId] = useState('');

  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const currency = settings?.currency || 'PKR';

  useEffect(() => {
    Promise.all([
      apiFetch<any[]>('/api/customers'),
      apiFetch<any[]>('/api/properties'),
      apiFetch<any[]>('/api/accounts'),
    ])
      .then(([c, p, a]) => {
        setCustomers(c);
        setProperties(p);
        setAccounts(a.filter((acc) => acc.parentId !== null));
        if (c[0]) setCustomerId(String(c[0].id));
        if (p[0]) setPropertyId(String(p[0].id));
        if (a.find((x) => x.code === '1100')) {
          setAccountId(String(a.find((x) => x.code === '1100').id));
        }
      })
      .catch(() => {});
  }, [apiFetch]);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ mode, fromDate, toDate });
      if (mode === 'customer' && customerId) qs.set('customerId', customerId);
      if (mode === 'property' && propertyId) qs.set('propertyId', propertyId);
      if (mode === 'account' && accountId) qs.set('accountId', accountId);
      const res = await apiFetch(`/api/ledgers?${qs.toString()}`);
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, mode, fromDate, toDate, customerId, propertyId, accountId]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const activeTitle = LEDGER_MODES.find((m) => m.id === mode)?.label || 'Ledger';

  const handleExportExcel = () => {
    if (!data) return;
    if (mode === 'trial_balance') {
      exportToExcel(
        'HAMA_NAGAR_Trial_Balance',
        'Trial Balance',
        (data.rows || []).map((r: any) => ({
          Code: r.code,
          Account: r.name,
          Type: r.accountType,
          'Period Debit': r.totalDebit,
          'Period Credit': r.totalCredit,
          'Debit Balance': r.debitBalance,
          'Credit Balance': r.creditBalance,
        }))
      );
      return;
    }
    if (data.rows) {
      exportToExcel(
        `HAMA_NAGAR_${mode}_Ledger`,
        activeTitle,
        data.rows.map((r: any) => ({
          Date: r.entryDate,
          Voucher: r.voucherNumber,
          Account: `${r.accountCode} ${r.accountName}`,
          Customer: r.customerName,
          Property: r.propertyNumber,
          Narration: r.narration,
          Debit: r.debit,
          Credit: r.credit,
          Balance: r.runningBalance,
        }))
      );
    }
  };

  const handleExportPDF = () => {
    if (!data) return;
    if (mode === 'trial_balance') {
      exportToPDF({
        title: 'Trial Balance',
        subtitle: `As of ${toDate}`,
        headers: ['Code', 'Account Name', 'Type', 'Debit Balance', 'Credit Balance'],
        rows: (data.rows || []).map((r: any) => [
          r.code,
          r.name,
          r.accountType,
          formatPKR(r.debitBalance, currency),
          formatPKR(r.creditBalance, currency),
        ]),
        totalsRow: [
          '',
          'TOTAL TRIAL BALANCE',
          '',
          formatPKR(data.sumDebit, currency),
          formatPKR(data.sumCredit, currency),
        ],
        filename: 'HAMA_NAGAR_Trial_Balance',
        settings,
      });
      return;
    }
    if (data.rows) {
      exportToPDF({
        title: activeTitle,
        subtitle: `From ${fromDate} to ${toDate}`,
        headers: ['Date', 'Voucher', 'Account', 'Narration', 'Debit', 'Credit', 'Balance'],
        rows: data.rows.map((r: any) => [
          r.entryDate,
          r.voucherNumber,
          `${r.accountCode} ${r.accountName}`,
          r.narration,
          r.debit > 0 ? formatPKR(r.debit, currency) : '—',
          r.credit > 0 ? formatPKR(r.credit, currency) : '—',
          formatPKR(r.runningBalance, currency),
        ]),
        totalsRow: [
          '',
          '',
          'CLOSING TOTALS',
          '',
          formatPKR(data.totalDebit, currency),
          formatPKR(data.totalCredit, currency),
          formatPKR(data.closingBalance, currency),
        ],
        filename: `HAMA_NAGAR_${mode}_Ledger`,
        settings,
        orientation: 'landscape',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Ledgers & Financial Statements</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Double-entry general ledger, customer/property sub-ledgers, trial balance, P&L, and balance sheet
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF
          </button>
          <button
            onClick={() => setPrintOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Mode Selector + Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-1">
          {LEDGER_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
                mode === m.id
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-slate-500 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
            />
          </div>
          <div>
            <label className="block text-slate-500 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
            />
          </div>

          {mode === 'customer' && (
            <div>
              <label className="block text-slate-500 mb-1">Select Customer</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customerCode} · {c.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'property' && (
            <div>
              <label className="block text-slate-500 mb-1">Select Property</label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.propertyNumber} ({p.block})
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'account' && (
            <div>
              <label className="block text-slate-500 mb-1">Select Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-end">
            <button
              onClick={loadLedger}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Generate
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {/* Render Trial Balance */}
      {mode === 'trial_balance' && data && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900">Trial Balance as of {toDate}</span>
            <span
              className={`font-mono font-bold ${
                Math.abs((data.sumDebit || 0) - (data.sumCredit || 0)) < 0.01
                  ? 'text-emerald-700'
                  : 'text-red-700'
              }`}
            >
              {Math.abs((data.sumDebit || 0) - (data.sumCredit || 0)) < 0.01
                ? 'Balanced (Debit = Credit)'
                : 'Out of Balance'}
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Account Name</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4 text-right">Debit Balance</th>
                <th className="py-2.5 px-4 text-right">Credit Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.rows || []).map((r: any) => (
                <tr key={r.accountId} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-mono">{r.code}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{r.name}</td>
                  <td className="py-2.5 px-4 text-slate-500">{r.accountType}</td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {r.debitBalance > 0 ? formatPKR(r.debitBalance, currency) : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">
                    {r.creditBalance > 0 ? formatPKR(r.creditBalance, currency) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold font-mono">
              <tr>
                <td colSpan={3} className="py-3 px-4 text-right font-sans">
                  TOTAL TRIAL BALANCE
                </td>
                <td className="py-3 px-4 text-right">{formatPKR(data.sumDebit, currency)}</td>
                <td className="py-3 px-4 text-right">{formatPKR(data.sumCredit, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Render Income Statement */}
      {mode === 'income_statement' && data && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">
                Operating Income
              </h4>
              <div className="space-y-2">
                {(data.incomeAccounts || []).map((a: any) => (
                  <div key={a.id} className="flex justify-between">
                    <span>
                      <span className="font-mono text-slate-500 mr-2">{a.code}</span>
                      {a.name}
                    </span>
                    <span className="font-mono font-semibold">
                      {formatPKR(a.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-2 border-t border-slate-300 flex justify-between font-bold text-emerald-700">
                <span>Total Income</span>
                <span className="font-mono">{formatPKR(data.totalIncome, currency)}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">
                Operating Expenses
              </h4>
              <div className="space-y-2">
                {(data.expenseAccounts || []).map((a: any) => (
                  <div key={a.id} className="flex justify-between">
                    <span>
                      <span className="font-mono text-slate-500 mr-2">{a.code}</span>
                      {a.name}
                    </span>
                    <span className="font-mono font-semibold">
                      {formatPKR(a.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-2 border-t border-slate-300 flex justify-between font-bold text-red-700">
                <span>Total Expenses</span>
                <span className="font-mono">{formatPKR(data.totalExpenses, currency)}</span>
              </div>
            </div>
          </div>

          <div className="border-t-2 border-slate-900 pt-4 flex justify-between items-center text-sm font-bold">
            <span>Net Profit / (Loss) for Period</span>
            <span
              className={`font-mono ${
                (data.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatPKR(data.netProfit, currency)}
            </span>
          </div>
        </div>
      )}

      {/* Render Balance Sheet */}
      {mode === 'balance_sheet' && data && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">
                Assets
              </h4>
              <div className="space-y-2">
                {(data.assets || []).map((a: any) => (
                  <div key={a.id} className="flex justify-between">
                    <span>
                      <span className="font-mono text-slate-500 mr-2">{a.code}</span>
                      {a.name}
                    </span>
                    <span className="font-mono font-semibold">
                      {formatPKR(a.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-2 border-t-2 border-slate-900 flex justify-between font-bold text-sm">
                <span>Total Assets</span>
                <span className="font-mono">{formatPKR(data.totalAssets, currency)}</span>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">
                  Liabilities
                </h4>
                <div className="space-y-2">
                  {(data.liabilities || []).map((a: any) => (
                    <div key={a.id} className="flex justify-between">
                      <span>
                        <span className="font-mono text-slate-500 mr-2">{a.code}</span>
                        {a.name}
                      </span>
                      <span className="font-mono font-semibold">
                        {formatPKR(a.amount, currency)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between font-semibold">
                  <span>Total Liabilities</span>
                  <span className="font-mono">{formatPKR(data.totalLiabilities, currency)}</span>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 uppercase tracking-wider border-b border-slate-200 pb-2 mb-3">
                  Capital & Retained Earnings
                </h4>
                <div className="space-y-2">
                  {(data.capital || []).map((a: any) => (
                    <div key={a.id} className="flex justify-between">
                      <span>
                        <span className="font-mono text-slate-500 mr-2">{a.code}</span>
                        {a.name}
                      </span>
                      <span className="font-mono font-semibold">
                        {formatPKR(a.amount, currency)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span>Current Period Earnings</span>
                    <span className="font-mono font-semibold">
                      {formatPKR(data.currentPeriodEarnings, currency)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-2 border-t-2 border-slate-900 flex justify-between font-bold text-sm">
                  <span>Total Liabilities & Capital</span>
                  <span className="font-mono">
                    {formatPKR(data.totalLiabilitiesAndCapital, currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Render Transaction Ledger Table */}
      {data && data.rows && mode !== 'trial_balance' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500">Opening Balance: </span>
              <span className="font-mono font-bold">
                {formatPKR(data.openingBalance, currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Period Debit: </span>
              <span className="font-mono font-bold text-slate-900">
                {formatPKR(data.totalDebit, currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Period Credit: </span>
              <span className="font-mono font-bold text-slate-900">
                {formatPKR(data.totalCredit, currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Closing Balance: </span>
              <span className="font-mono font-bold text-teal-800">
                {formatPKR(data.closingBalance, currency)}
              </span>
            </div>
          </div>

          {data.rows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No ledger entries found for the selected filter and date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Voucher</th>
                    <th className="py-2.5 px-3">Account</th>
                    <th className="py-2.5 px-3">Customer / Property</th>
                    <th className="py-2.5 px-3">Narration</th>
                    <th className="py-2.5 px-3 text-right">Debit</th>
                    <th className="py-2.5 px-3 text-right">Credit</th>
                    <th className="py-2.5 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((r: any) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono whitespace-nowrap">
                        {formatDateDisplay(r.entryDate)}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold">{r.voucherNumber}</td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-slate-500 mr-1">{r.accountCode}</span>
                        {r.accountName}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {r.customerName || '—'} {r.propertyNumber ? `(${r.propertyNumber})` : ''}
                      </td>
                      <td className="py-2 px-3 text-slate-600 max-w-xs truncate">{r.narration}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {r.debit > 0 ? formatPKR(r.debit, currency) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {r.credit > 0 ? formatPKR(r.credit, currency) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                        {formatPKR(r.runningBalance, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Printable Ledger */}
      {data && (
        <PrintDocumentModal
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          title={activeTitle.toUpperCase()}
          documentDate={`${fromDate} to ${toDate}`}
          settings={settings}
        >
          {mode === 'trial_balance' ? (
            <table className="w-full text-left border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300">Code</th>
                  <th className="p-2 border-r border-slate-300">Account Name</th>
                  <th className="p-2 border-r border-slate-300 text-right">Debit</th>
                  <th className="p-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(data.rows || []).map((r: any) => (
                  <tr key={r.accountId} className="border-b border-slate-200">
                    <td className="p-1.5 border-r border-slate-200 font-mono">{r.code}</td>
                    <td className="p-1.5 border-r border-slate-200">{r.name}</td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                      {r.debitBalance > 0 ? formatPKR(r.debitBalance, currency) : '—'}
                    </td>
                    <td className="p-1.5 text-right font-mono">
                      {r.creditBalance > 0 ? formatPKR(r.creditBalance, currency) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold font-mono">
                  <td colSpan={2} className="p-2 border-r border-slate-300 text-right font-sans">
                    TOTAL
                  </td>
                  <td className="p-2 border-r border-slate-300 text-right">
                    {formatPKR(data.sumDebit, currency)}
                  </td>
                  <td className="p-2 text-right">{formatPKR(data.sumCredit, currency)}</td>
                </tr>
              </tfoot>
            </table>
          ) : data.rows ? (
            <table className="w-full text-left border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300">Date</th>
                  <th className="p-2 border-r border-slate-300">Voucher</th>
                  <th className="p-2 border-r border-slate-300">Account / Narration</th>
                  <th className="p-2 border-r border-slate-300 text-right">Debit</th>
                  <th className="p-2 border-r border-slate-300 text-right">Credit</th>
                  <th className="p-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-200">
                    <td className="p-1.5 border-r border-slate-200 font-mono">{r.entryDate}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono">{r.voucherNumber}</td>
                    <td className="p-1.5 border-r border-slate-200">
                      {r.accountCode} {r.accountName} — {r.narration}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                      {r.debit > 0 ? formatPKR(r.debit, currency) : '—'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                      {r.credit > 0 ? formatPKR(r.credit, currency) : '—'}
                    </td>
                    <td className="p-1.5 text-right font-mono font-semibold">
                      {formatPKR(r.runningBalance, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-xs text-slate-600">
              Use the PDF Export button for formatted Profit & Loss / Balance Sheet statements.
            </div>
          )}
        </PrintDocumentModal>
      )}
    </div>
  );
}
