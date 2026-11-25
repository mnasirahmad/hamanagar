import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Trash2, X, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDateDisplay, formatPKR } from '../lib/formatters';
import { PrintDocumentModal } from '../components/PrintDocumentModal';

export function VouchersPage() {
  const { apiFetch, erpUser, settings } = useAuth();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'ALL' | 'NEW_CRV' | 'NEW_CPV' | 'NEW_JV'>('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [submitting, setSubmitting] = useState(false);

  const [printVoucher, setPrintVoucher] = useState<any | null>(null);

  // CRV Form
  const [crv, setCrv] = useState({
    voucherDate: new Date().toISOString().slice(0, 10),
    customerId: '',
    saleId: '',
    receiptCategory: 'Installment',
    amountReceived: '',
    lateFeeAmount: '0',
    cashBankAccountId: '',
    paymentMethod: 'Cash',
    referenceNo: '',
    narration: '',
    partyName: '',
  });

  // CPV Form
  const [cpv, setCpv] = useState({
    voucherDate: new Date().toISOString().slice(0, 10),
    paidTo: '',
    expenseAccountId: '',
    amount: '',
    cashBankAccountId: '',
    paymentMethod: 'Cash',
    referenceNo: '',
    narration: '',
  });

  // JV Form
  const [jvDate, setJvDate] = useState(new Date().toISOString().slice(0, 10));
  const [jvNarration, setJvNarration] = useState('');
  const [jvLines, setJvLines] = useState([
    { accountId: '', debit: '', credit: '', narration: '' },
    { accountId: '', debit: '', credit: '', narration: '' },
  ]);

  const currency = settings?.currency || 'PKR';
  const canCRV =
    erpUser?.role === 'admin' || erpUser?.role === 'accounts' || erpUser?.role === 'recovery';
  const canCPVJV = erpUser?.role === 'admin' || erpUser?.role === 'accounts';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vRows, aRows, cRows, sRows] = await Promise.all([
        apiFetch<any[]>('/api/vouchers'),
        apiFetch<any[]>('/api/accounts'),
        apiFetch<any[]>('/api/customers'),
        apiFetch<any[]>('/api/sales'),
      ]);
      setVouchers(vRows);
      setAccounts(aRows);
      setCustomers(cRows);
      setSales(sRows);

      const defaultCash = aRows.find((a) => a.code === '1100');
      const defaultExp = aRows.find((a) => a.accountType === 'EXPENSE' && a.parentId !== null);
      if (defaultCash) {
        setCrv((p) => ({ ...p, cashBankAccountId: p.cashBankAccountId || String(defaultCash.id) }));
        setCpv((p) => ({ ...p, cashBankAccountId: p.cashBankAccountId || String(defaultCash.id) }));
      }
      if (defaultExp) {
        setCpv((p) => ({ ...p, expenseAccountId: p.expenseAccountId || String(defaultExp.id) }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cashBankAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.isActive && (a.code === '1100' || a.code.startsWith('12')) && a.parentId !== null
      ),
    [accounts]
  );

  const postableAccounts = useMemo(
    () => accounts.filter((a) => a.isActive && a.parentId !== null),
    [accounts]
  );

  const customerSales = useMemo(
    () =>
      sales.filter(
        (s) => String(s.customerId) === crv.customerId && s.status !== 'Cancelled'
      ),
    [sales, crv.customerId]
  );

  const jvTotals = useMemo(() => {
    const debit = jvLines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = jvLines.reduce((s, l) => s + Number(l.credit || 0), 0);
    const balanced = debit > 0 && Math.abs(debit - credit) < 0.005;
    return { debit, credit, balanced };
  }, [jvLines]);

  const handleCreateCRV = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const cust = customers.find((c) => String(c.id) === crv.customerId);
      const posted = await apiFetch('/api/vouchers/crv', {
        method: 'POST',
        body: JSON.stringify({
          ...crv,
          customerId: crv.customerId ? Number(crv.customerId) : null,
          saleId: crv.saleId ? Number(crv.saleId) : null,
          partyName: cust?.fullName || crv.partyName,
        }),
      });
      setActiveTab('ALL');
      await loadData();
      const refreshed = await apiFetch<any[]>('/api/vouchers');
      const full = refreshed.find((v) => v.id === posted.id);
      if (full) setPrintVoucher(full);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateCPV = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const posted = await apiFetch('/api/vouchers/cpv', {
        method: 'POST',
        body: JSON.stringify(cpv),
      });
      setActiveTab('ALL');
      setCpv((p) => ({ ...p, paidTo: '', amount: '', referenceNo: '', narration: '' }));
      await loadData();
      const refreshed = await apiFetch<any[]>('/api/vouchers');
      const full = refreshed.find((v) => v.id === posted.id);
      if (full) setPrintVoucher(full);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateJV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jvTotals.balanced) {
      setError('Total Debit must equal Total Credit before posting a Journal Voucher.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const posted = await apiFetch('/api/vouchers/jv', {
        method: 'POST',
        body: JSON.stringify({
          voucherDate: jvDate,
          narration: jvNarration,
          lines: jvLines.map((l) => ({
            accountId: Number(l.accountId),
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            narration: l.narration || jvNarration,
          })),
        }),
      });
      setActiveTab('ALL');
      setJvNarration('');
      setJvLines([
        { accountId: '', debit: '', credit: '', narration: '' },
        { accountId: '', debit: '', credit: '', narration: '' },
      ]);
      await loadData();
      const refreshed = await apiFetch<any[]>('/api/vouchers');
      const full = refreshed.find((v) => v.id === posted.id);
      if (full) setPrintVoucher(full);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverseVoucher = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/vouchers/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Authorized cancellation & reversal' }),
      });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredVouchers = useMemo(() => {
    if (typeFilter === 'ALL') return vouchers;
    return vouchers.filter((v) => v.voucherType === typeFilter);
  }, [vouchers, typeFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Accounting Vouchers (CRV · CPV · JV)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Double-entry receipts, expense disbursements, and multi-line journal entries with reversal audit trail
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-md border border-slate-200">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
              activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Voucher Register
          </button>
          {canCRV && (
            <button
              onClick={() => setActiveTab('NEW_CRV')}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                activeTab === 'NEW_CRV' ? 'bg-teal-700 text-white' : 'text-slate-600'
              }`}
            >
              + Cash Receipt (CRV)
            </button>
          )}
          {canCPVJV && (
            <>
              <button
                onClick={() => setActiveTab('NEW_CPV')}
                className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                  activeTab === 'NEW_CPV' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                + Cash Payment (CPV)
              </button>
              <button
                onClick={() => setActiveTab('NEW_JV')}
                className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                  activeTab === 'NEW_JV' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                + Journal Voucher (JV)
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {/* CRV Form */}
      {activeTab === 'NEW_CRV' && (
        <form
          onSubmit={handleCreateCRV}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs"
        >
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">New Cash Receipt Voucher (CRV)</h3>
            <span className="font-mono text-slate-500">
              Auto No: {settings?.crvPrefix || 'CRV'}-XXXX
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Voucher Date *</label>
              <input
                required
                type="date"
                value={crv.voucherDate}
                onChange={(e) => setCrv({ ...crv, voucherDate: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Receipt Category *</label>
              <select
                value={crv.receiptCategory}
                onChange={(e) => setCrv({ ...crv, receiptCategory: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="Installment">Monthly Installment</option>
                <option value="Booking">Booking Amount</option>
                <option value="Down Payment">Down Payment</option>
                <option value="Advance">Advance Installments</option>
                <option value="Other">Other Customer Receipt</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Customer (Optional)</label>
              <select
                value={crv.customerId}
                onChange={(e) => setCrv({ ...crv, customerId: e.target.value, saleId: '' })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="">-- Walk-in / General Account --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customerCode} · {c.fullName}
                  </option>
                ))}
              </select>
            </div>
            {crv.customerId && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Linked Sale Invoice / Property
                </label>
                <select
                  value={crv.saleId}
                  onChange={(e) => setCrv({ ...crv, saleId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                >
                  <option value="">-- General Customer Account --</option>
                  {customerSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.invoiceNumber} · {s.property?.propertyNumber} (Pending:{' '}
                      {formatPKR(s.pendingBalance, currency)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!crv.customerId && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">Received From *</label>
                <input
                  required
                  type="text"
                  value={crv.partyName}
                  onChange={(e) => setCrv({ ...crv, partyName: e.target.value })}
                  placeholder="Payer name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
            )}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Amount Received ({currency}) *
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={crv.amountReceived}
                onChange={(e) => setCrv({ ...crv, amountReceived: e.target.value })}
                className="w-full px-3 py-2 font-mono font-bold border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Late Payment Charges ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={crv.lateFeeAmount}
                onChange={(e) => setCrv({ ...crv, lateFeeAmount: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Deposit To (Cash / Bank) *
              </label>
              <select
                required
                value={crv.cashBankAccountId}
                onChange={(e) => setCrv({ ...crv, cashBankAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {cashBankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
              <select
                value={crv.paymentMethod}
                onChange={(e) => setCrv({ ...crv, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Pay Order">Pay Order</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Transaction Reference
              </label>
              <input
                type="text"
                value={crv.referenceNo}
                onChange={(e) => setCrv({ ...crv, referenceNo: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Narration *</label>
            <input
              required
              type="text"
              value={crv.narration}
              onChange={(e) => setCrv({ ...crv, narration: e.target.value })}
              placeholder="e.g. Monthly installment receipt against plot..."
              className="w-full px-3 py-2 border border-slate-200 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
            >
              {submitting ? 'Posting CRV...' : 'Post Cash Receipt Voucher'}
            </button>
          </div>
        </form>
      )}

      {/* CPV Form */}
      {activeTab === 'NEW_CPV' && (
        <form
          onSubmit={handleCreateCPV}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs"
        >
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">New Cash Payment Voucher (CPV)</h3>
            <span className="font-mono text-slate-500">
              Auto No: {settings?.cpvPrefix || 'CPV'}-XXXX
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Voucher Date *</label>
              <input
                required
                type="date"
                value={cpv.voucherDate}
                onChange={(e) => setCpv({ ...cpv, voucherDate: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Paid To (Payee) *</label>
              <input
                required
                type="text"
                value={cpv.paidTo}
                onChange={(e) => setCpv({ ...cpv, paidTo: e.target.value })}
                placeholder="Vendor, Contractor, Employee..."
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Expense / Account Head *
              </label>
              <select
                required
                value={cpv.expenseAccountId}
                onChange={(e) => setCpv({ ...cpv, expenseAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {postableAccounts
                  .filter((a) => a.code !== '1100' && !a.code.startsWith('12'))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name} ({a.accountType})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Amount ({currency}) *
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={cpv.amount}
                onChange={(e) => setCpv({ ...cpv, amount: e.target.value })}
                className="w-full px-3 py-2 font-mono font-bold border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Paid From (Cash / Bank) *
              </label>
              <select
                required
                value={cpv.cashBankAccountId}
                onChange={(e) => setCpv({ ...cpv, cashBankAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                {cashBankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Method</label>
              <select
                value={cpv.paymentMethod}
                onChange={(e) => setCpv({ ...cpv, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Cheque / Ref No</label>
              <input
                type="text"
                value={cpv.referenceNo}
                onChange={(e) => setCpv({ ...cpv, referenceNo: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Description / Narration *
              </label>
              <input
                required
                type="text"
                value={cpv.narration}
                onChange={(e) => setCpv({ ...cpv, narration: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
            >
              {submitting ? 'Posting CPV...' : 'Post Cash Payment Voucher'}
            </button>
          </div>
        </form>
      )}

      {/* JV Form */}
      {activeTab === 'NEW_JV' && (
        <form
          onSubmit={handleCreateJV}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-4 text-xs"
        >
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              New Journal Voucher (JV — Double Entry)
            </h3>
            <span className="font-mono text-slate-500">
              Auto No: {settings?.jvPrefix || 'JV'}-XXXX
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Voucher Date *</label>
              <input
                required
                type="date"
                value={jvDate}
                onChange={(e) => setJvDate(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Voucher Narration *</label>
              <input
                required
                type="text"
                value={jvNarration}
                onChange={(e) => setJvNarration(e.target.value)}
                placeholder="Overall journal entry description"
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Account Code & Name</th>
                  <th className="p-2.5">Line Narration</th>
                  <th className="p-2.5 text-right w-36">Debit</th>
                  <th className="p-2.5 text-right w-36">Credit</th>
                  <th className="p-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jvLines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <select
                        required
                        value={line.accountId}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].accountId = e.target.value;
                          setJvLines(next);
                        }}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                      >
                        <option value="">-- Select Account --</option>
                        {postableAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={line.narration}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].narration = e.target.value;
                          setJvLines(next);
                        }}
                        placeholder="Optional line note"
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.debit}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].debit = e.target.value;
                          if (Number(e.target.value) > 0) next[idx].credit = '';
                          setJvLines(next);
                        }}
                        className="w-full px-2.5 py-1.5 font-mono text-right border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.credit}
                        onChange={(e) => {
                          const next = [...jvLines];
                          next[idx].credit = e.target.value;
                          if (Number(e.target.value) > 0) next[idx].debit = '';
                          setJvLines(next);
                        }}
                        className="w-full px-2.5 py-1.5 font-mono text-right border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-2 text-center">
                      {jvLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setJvLines(jvLines.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-mono font-bold">
                <tr>
                  <td colSpan={2} className="p-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setJvLines([
                          ...jvLines,
                          { accountId: '', debit: '', credit: '', narration: '' },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-teal-700 hover:underline font-sans cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Account Line
                    </button>
                  </td>
                  <td className="p-2.5 text-right">{formatPKR(jvTotals.debit, currency)}</td>
                  <td className="p-2.5 text-right">{formatPKR(jvTotals.credit, currency)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span
              className={`font-semibold ${
                jvTotals.balanced ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {jvTotals.balanced
                ? 'Balanced: Total Debit equals Total Credit'
                : `Unbalanced Difference: ${formatPKR(
                    Math.abs(jvTotals.debit - jvTotals.credit),
                    currency
                  )}`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !jvTotals.balanced}
                className="px-5 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Posting JV...' : 'Post Journal Voucher'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Voucher Register */}
      {activeTab === 'ALL' && (
        <>
          <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap gap-1">
            {['ALL', 'CRV', 'CPV', 'JV', 'SALE', 'REVERSAL'].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                  typeFilter === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t === 'ALL' ? 'All Vouchers' : t}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading vouchers...</div>
            ) : filteredVouchers.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No vouchers posted yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="py-3 px-4">Voucher No</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Party / Customer</th>
                      <th className="py-3 px-4">Method / Ref</th>
                      <th className="py-3 px-4">Narration</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredVouchers.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                          {v.voucherNumber}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{v.voucherType}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {formatDateDisplay(v.voucherDate)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800">
                          {v.customer?.fullName || v.partyName || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {v.paymentMethod} {v.referenceNo ? `· ${v.referenceNo}` : ''}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                          {v.narration}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                          {formatPKR(v.totalAmount, currency)}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`font-semibold ${
                              v.status === 'Posted' ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {v.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1">
                          <button
                            onClick={() => setPrintVoucher(v)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Print
                          </button>
                          {canCPVJV &&
                            v.status === 'Posted' &&
                            v.voucherType !== 'REVERSAL' &&
                            v.voucherType !== 'SALE' && (
                              <button
                                onClick={() => handleReverseVoucher(v.id)}
                                className="p-1.5 text-slate-500 hover:text-red-700 rounded hover:bg-red-50 cursor-pointer"
                                title="Cancel & Post Reversal"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Printable Voucher */}
      {printVoucher && (
        <PrintDocumentModal
          open={Boolean(printVoucher)}
          onClose={() => setPrintVoucher(null)}
          title={
            printVoucher.voucherType === 'CRV'
              ? 'CASH RECEIPT VOUCHER (CRV)'
              : printVoucher.voucherType === 'CPV'
              ? 'CASH PAYMENT VOUCHER (CPV)'
              : printVoucher.voucherType === 'JV'
              ? 'JOURNAL VOUCHER (JV)'
              : `${printVoucher.voucherType} VOUCHER`
          }
          documentNumber={printVoucher.voucherNumber}
          documentDate={printVoucher.voucherDate}
          settings={settings}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-300 p-4">
              <div>
                <div>
                  <span className="font-semibold">Party / Account: </span>
                  {printVoucher.customer?.fullName || printVoucher.partyName || 'General Ledger'}
                </div>
                {printVoucher.property && (
                  <div>
                    <span className="font-semibold">Property: </span>
                    <span className="font-mono">{printVoucher.property.propertyNumber}</span>
                  </div>
                )}
                {printVoucher.sale && (
                  <div>
                    <span className="font-semibold">Sale Invoice: </span>
                    <span className="font-mono">{printVoucher.sale.invoiceNumber}</span>
                  </div>
                )}
              </div>
              <div>
                <div>
                  <span className="font-semibold">Payment Method: </span>
                  {printVoucher.paymentMethod}
                </div>
                <div>
                  <span className="font-semibold">Reference No: </span>
                  <span className="font-mono">{printVoucher.referenceNo || '—'}</span>
                </div>
                <div>
                  <span className="font-semibold">Status: </span>
                  <span className="font-bold">{printVoucher.status}</span>
                </div>
              </div>
            </div>

            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300">Account Code</th>
                  <th className="p-2 border-r border-slate-300">Account Name</th>
                  <th className="p-2 border-r border-slate-300">Narration</th>
                  <th className="p-2 border-r border-slate-300 text-right">Debit</th>
                  <th className="p-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(printVoucher.entries || []).map((e: any) => (
                  <tr key={e.id} className="border-b border-slate-200">
                    <td className="p-2 border-r border-slate-200 font-mono">
                      {e.account?.code}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-medium">
                      {e.account?.name}
                    </td>
                    <td className="p-2 border-r border-slate-200">{e.narration}</td>
                    <td className="p-2 border-r border-slate-200 text-right font-mono">
                      {Number(e.debit) > 0 ? formatPKR(e.debit, currency) : '—'}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {Number(e.credit) > 0 ? formatPKR(e.credit, currency) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold border-t border-slate-300">
                  <td colSpan={3} className="p-2 border-r border-slate-300 text-right">
                    Total
                  </td>
                  <td className="p-2 border-r border-slate-300 text-right font-mono">
                    {formatPKR(printVoucher.totalAmount, currency)}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {formatPKR(printVoucher.totalAmount, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </PrintDocumentModal>
      )}
    </div>
  );
}
