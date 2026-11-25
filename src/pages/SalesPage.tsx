import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Eye, XCircle, X, FileSpreadsheet, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToPDF, formatDateDisplay, formatPKR } from '../lib/formatters';
import { PrintDocumentModal } from '../components/PrintDocumentModal';

export function SalesPage() {
  const { apiFetch, erpUser, settings } = useAuth();
  const [salesList, setSalesList] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saleMode, setSaleMode] = useState<'REGISTER' | 'NEW_INSTALLMENT' | 'NEW_CASH'>('REGISTER');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INSTALLMENT' | 'CASH'>('ALL');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [selectedSaleDetail, setSelectedSaleDetail] = useState<any | null>(null);
  const [printMode, setPrintMode] = useState<'INVOICE' | 'SCHEDULE' | null>(null);

  const [form, setForm] = useState({
    saleDate: new Date().toISOString().slice(0, 10),
    customerId: '',
    propertyId: '',
    totalPrice: '0',
    discount: '0',
    bookingAmount: '0',
    downPayment: '0',
    durationMonths: String(settings?.defaultInstallmentMonths || 36),
    firstInstallmentDate: '',
    dueDay: '10',
    paymentFrequency: 'Monthly',
    paymentMethod: 'Cash',
    cashBankAccountId: '',
    termsAndConditions: '',
    remarks: '',
  });

  const canCreate = erpUser?.role === 'admin' || erpUser?.role === 'sales';
  const currency = settings?.currency || 'PKR';

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRows, pRows, cRows, aRows] = await Promise.all([
        apiFetch<any[]>('/api/sales'),
        apiFetch<any[]>('/api/properties'),
        apiFetch<any[]>('/api/customers'),
        apiFetch<any[]>('/api/accounts'),
      ]);
      setSalesList(sRows);
      setProperties(pRows);
      setCustomers(cRows);
      setAccounts(aRows);

      const defaultCash = aRows.find((a) => a.code === '1100');
      if (defaultCash && !form.cashBankAccountId) {
        setForm((prev) => ({ ...prev, cashBankAccountId: String(defaultCash.id) }));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const availableProperties = useMemo(
    () => properties.filter((p) => p.bookingStatus === 'Available' || p.bookingStatus === 'Reserved'),
    [properties]
  );

  const cashBankAccounts = useMemo(
    () => accounts.filter((a) => a.isActive && (a.code === '1100' || a.code.startsWith('12')) && a.parentId !== null),
    [accounts]
  );

  const handlePropertySelect = (propId: string) => {
    const prop = properties.find((p) => String(p.id) === propId);
    setForm((prev) => ({
      ...prev,
      propertyId: propId,
      totalPrice: prop ? String(prop.totalPrice) : '0',
    }));
  };

  // Real-time financial calculations
  const calc = useMemo(() => {
    const total = Number(form.totalPrice || 0);
    const discount = Number(form.discount || 0);
    const netSale = Math.max(0, total - discount);
    const booking = saleMode === 'NEW_INSTALLMENT' ? Number(form.bookingAmount || 0) : 0;
    const down = saleMode === 'NEW_INSTALLMENT' ? Number(form.downPayment || 0) : netSale;
    const remaining = saleMode === 'NEW_INSTALLMENT' ? Math.max(0, netSale - booking - down) : 0;
    const months = Math.max(1, parseInt(form.durationMonths || '1', 10));
    const monthly = saleMode === 'NEW_INSTALLMENT' ? remaining / months : 0;
    return { total, discount, netSale, booking, down, remaining, months, monthly };
  }, [form, saleMode]);

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          saleType: saleMode === 'NEW_CASH' ? 'CASH' : 'INSTALLMENT',
        }),
      });
      setSaleMode('REGISTER');
      await loadAll();
      // Open detail view immediately so user can print invoice / schedule
      const detail = await apiFetch(`/api/sales/${created.id}`);
      setSelectedSaleDetail(detail);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const detail = await apiFetch(`/api/sales/${id}`);
      setSelectedSaleDetail(detail);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancelSale = async (saleId: number) => {
    try {
      await apiFetch(`/api/sales/${saleId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelled via Sales Register' }),
      });
      setSelectedSaleDetail(null);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredSales = useMemo(() => {
    return salesList.filter((s) => {
      if (typeFilter !== 'ALL' && s.saleType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.invoiceNumber.toLowerCase().includes(q) ||
          s.customer?.fullName?.toLowerCase().includes(q) ||
          s.property?.propertyNumber?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [salesList, typeFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Property Sales Module</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create installment contracts with auto-schedules or cash sales with instant accounting entries
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 p-1 rounded-md border border-slate-200">
            <button
              onClick={() => setSaleMode('REGISTER')}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                saleMode === 'REGISTER' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Sales Register
            </button>
            {canCreate && (
              <>
                <button
                  onClick={() => setSaleMode('NEW_INSTALLMENT')}
                  className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                    saleMode === 'NEW_INSTALLMENT'
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Installment Sale
                </button>
                <button
                  onClick={() => setSaleMode('NEW_CASH')}
                  className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                    saleMode === 'NEW_CASH'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Cash Sale
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {/* New Sale Form */}
      {(saleMode === 'NEW_INSTALLMENT' || saleMode === 'NEW_CASH') && (
        <form
          onSubmit={handleSubmitSale}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-6"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              {saleMode === 'NEW_INSTALLMENT'
                ? 'New Installment Sale Agreement'
                : 'New Cash Property Sale'}
            </h3>
            <span className="text-xs font-mono text-slate-500">
              Auto Invoice: {settings?.invoicePrefix || 'INV'}-{new Date().getFullYear()}-XXXX
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sale Date *</label>
              <input
                required
                type="date"
                value={form.saleDate}
                onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Select Customer *
              </label>
              <select
                required
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customerCode} · {c.fullName} ({c.cnic})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Select Available Property *
              </label>
              <select
                required
                value={form.propertyId}
                onChange={(e) => handlePropertySelect(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="">-- Choose Plot / Shop --</option>
                {availableProperties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.propertyNumber} ({p.block}) · {p.category} · {p.sizeValue} {p.sizeUnit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Total Property Price ({currency}) *
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={form.totalPrice}
                onChange={(e) => setForm({ ...form, totalPrice: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Discount ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Net Sale Amount ({currency})
              </label>
              <input
                readOnly
                value={calc.netSale.toFixed(2)}
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-md text-slate-900"
              />
            </div>

            {saleMode === 'NEW_INSTALLMENT' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Booking Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.bookingAmount}
                    onChange={(e) => setForm({ ...form, bookingAmount: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Down Payment ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.downPayment}
                    onChange={(e) => setForm({ ...form, downPayment: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Remaining Installment Principal
                  </label>
                  <input
                    readOnly
                    value={calc.remaining.toFixed(2)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-amber-50 border border-amber-200 rounded-md text-amber-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Duration (No. of Installments) *
                  </label>
                  <input
                    required
                    type="number"
                    min="1"
                    max="240"
                    value={form.durationMonths}
                    onChange={(e) => setForm({ ...form, durationMonths: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Installment Amount ({form.paymentFrequency})
                  </label>
                  <input
                    readOnly
                    value={calc.monthly.toFixed(2)}
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-teal-50 border border-teal-200 rounded-md text-teal-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Frequency
                  </label>
                  <select
                    value={form.paymentFrequency}
                    onChange={(e) => setForm({ ...form, paymentFrequency: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Semi-Annual">Semi-Annual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    First Installment Date
                  </label>
                  <input
                    type="date"
                    value={form.firstInstallmentDate}
                    onChange={(e) => setForm({ ...form, firstInstallmentDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Monthly Due Day (1–28)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Payment Method
              </label>
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Pay Order">Pay Order</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Cash / Bank Account *
              </label>
              <select
                required
                value={form.cashBankAccountId}
                onChange={(e) => setForm({ ...form, cashBankAccountId: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                {cashBankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Special Terms & Conditions
              </label>
              <textarea
                rows={2}
                value={form.termsAndConditions}
                onChange={(e) => setForm({ ...form, termsAndConditions: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
              <textarea
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="text-xs text-slate-600">
              Double-entry accounting vouchers and customer ledger will post automatically.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSaleMode('REGISTER')}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Posting Sale & Accounting...' : 'Confirm & Post Sale'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Sales Register */}
      {saleMode === 'REGISTER' && (
        <>
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search Invoice, Customer, Plot No..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-md w-64"
              />
              <div className="inline-flex bg-slate-100 p-1 rounded-md">
                {(['ALL', 'INSTALLMENT', 'CASH'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                      typeFilter === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {t === 'ALL' ? 'All Sales' : t === 'INSTALLMENT' ? 'Installment' : 'Cash'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  exportToExcel(
                    'HAMA_NAGAR_Sales_Register',
                    'Sales',
                    filteredSales.map((s) => ({
                      Invoice: s.invoiceNumber,
                      Date: s.saleDate,
                      Type: s.saleType,
                      Customer: s.customer?.fullName,
                      Property: s.property?.propertyNumber,
                      'Total Price': Number(s.totalPrice),
                      Discount: Number(s.discount),
                      'Net Sale': Number(s.netSaleAmount),
                      Collected: s.totalCollected,
                      Pending: s.pendingBalance,
                      Status: s.status,
                    }))
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </button>
              <button
                onClick={() =>
                  exportToPDF({
                    title: 'Property Sales Register',
                    headers: ['Invoice', 'Date', 'Type', 'Customer', 'Property', 'Net Sale', 'Pending', 'Status'],
                    rows: filteredSales.map((s) => [
                      s.invoiceNumber,
                      s.saleDate,
                      s.saleType,
                      s.customer?.fullName || '',
                      s.property?.propertyNumber || '',
                      formatPKR(s.netSaleAmount, currency),
                      formatPKR(s.pendingBalance, currency),
                      s.status,
                    ]),
                    filename: 'HAMA_NAGAR_Sales_Register',
                    settings,
                    orientation: 'landscape',
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading sales register...</div>
            ) : filteredSales.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm text-slate-600">No property sales recorded yet.</p>
                {canCreate && (
                  <button
                    onClick={() => setSaleMode('NEW_INSTALLMENT')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Record First Sale
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Property</th>
                      <th className="py-3 px-4 text-right">Net Sale</th>
                      <th className="py-3 px-4 text-right">Collected</th>
                      <th className="py-3 px-4 text-right">Pending</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-semibold text-teal-800">
                          {s.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {formatDateDisplay(s.saleDate)}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-700">{s.saleType}</td>
                        <td className="py-2.5 px-4 text-slate-900">{s.customer?.fullName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-700">
                          {s.property?.propertyNumber} ({s.property?.block})
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                          {formatPKR(s.netSaleAmount, currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-700">
                          {formatPKR(s.totalCollected, currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-amber-700">
                          {formatPKR(s.pendingBalance, currency)}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`font-semibold ${
                              s.status === 'Cancelled'
                                ? 'text-red-700'
                                : s.status === 'Completed'
                                ? 'text-emerald-700'
                                : 'text-teal-700'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => openDetail(s.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Invoice & Schedule
                          </button>
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

      {/* Sale Detail Modal */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedSaleDetail.sale.invoiceNumber} · {selectedSaleDetail.sale.saleType} SALE
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedSaleDetail.customer?.fullName} · Property{' '}
                  {selectedSaleDetail.property?.propertyNumber}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setPrintMode('INVOICE')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Invoice
                </button>
                {selectedSaleDetail.installments?.length > 0 && (
                  <button
                    onClick={() => setPrintMode('SCHEDULE')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Schedule
                  </button>
                )}
                {erpUser?.role === 'admin' && selectedSaleDetail.sale.status !== 'Cancelled' && (
                  <button
                    onClick={() => handleCancelSale(selectedSaleDetail.sale.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel & Reverse Sale
                  </button>
                )}
                <button
                  onClick={() => setSelectedSaleDetail(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border border-slate-200 rounded p-4 bg-slate-50/50">
                <div>
                  <div className="text-slate-500">Total Price</div>
                  <div className="font-mono font-bold">
                    {formatPKR(selectedSaleDetail.sale.totalPrice, currency)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Discount</div>
                  <div className="font-mono font-bold">
                    {formatPKR(selectedSaleDetail.sale.discount, currency)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Net Sale Amount</div>
                  <div className="font-mono font-bold text-slate-900">
                    {formatPKR(selectedSaleDetail.sale.netSaleAmount, currency)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Booking + Down Payment</div>
                  <div className="font-mono font-bold text-emerald-700">
                    {formatPKR(
                      Number(selectedSaleDetail.sale.bookingAmount) +
                        Number(selectedSaleDetail.sale.downPayment),
                      currency
                    )}
                  </div>
                </div>
              </div>

              {selectedSaleDetail.installments?.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">
                    Installment Schedule ({selectedSaleDetail.installments.length} Installments)
                  </h4>
                  <div className="max-h-72 overflow-y-auto border border-slate-200 rounded">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">Due Date</th>
                          <th className="p-2 text-right">Amount</th>
                          <th className="p-2 text-right">Paid</th>
                          <th className="p-2 text-right">Remaining</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedSaleDetail.installments.map((inst: any) => (
                          <tr key={inst.id}>
                            <td className="p-2 font-mono">{inst.installmentNumber}</td>
                            <td className="p-2 font-mono">{inst.dueDate}</td>
                            <td className="p-2 text-right font-mono">
                              {formatPKR(inst.installmentAmount, currency)}
                            </td>
                            <td className="p-2 text-right font-mono text-emerald-700">
                              {formatPKR(inst.paidAmount, currency)}
                            </td>
                            <td className="p-2 text-right font-mono text-amber-700">
                              {formatPKR(inst.remainingAmount, currency)}
                            </td>
                            <td className="p-2 font-semibold">{inst.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Sales Invoice / Schedule */}
      {selectedSaleDetail && printMode && (
        <PrintDocumentModal
          open={Boolean(printMode)}
          onClose={() => setPrintMode(null)}
          title={
            printMode === 'INVOICE'
              ? `${selectedSaleDetail.sale.saleType} SALE INVOICE`
              : 'CUSTOMER INSTALLMENT SCHEDULE'
          }
          documentNumber={selectedSaleDetail.sale.invoiceNumber}
          documentDate={selectedSaleDetail.sale.saleDate}
          settings={settings}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 border border-slate-300 p-4 bg-slate-50">
              <div className="space-y-1">
                <div className="font-bold text-slate-900 uppercase text-[11px]">Buyer Details</div>
                <div>
                  <span className="font-semibold">Name: </span>
                  {selectedSaleDetail.customer?.fullName} ({selectedSaleDetail.customer?.customerCode})
                </div>
                <div>
                  <span className="font-semibold">S/O or W/O: </span>
                  {selectedSaleDetail.customer?.guardianName}
                </div>
                <div>
                  <span className="font-semibold">CNIC: </span>
                  <span className="font-mono">{selectedSaleDetail.customer?.cnic}</span>
                </div>
                <div>
                  <span className="font-semibold">Mobile: </span>
                  <span className="font-mono">{selectedSaleDetail.customer?.mobile}</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-slate-900 uppercase text-[11px]">Property Details</div>
                <div>
                  <span className="font-semibold">Property No: </span>
                  <span className="font-mono font-bold">
                    {selectedSaleDetail.property?.propertyNumber}
                  </span>
                </div>
                <div>
                  <span className="font-semibold">Block / Street: </span>
                  {selectedSaleDetail.property?.block}{' '}
                  {selectedSaleDetail.property?.streetNumber
                    ? `· St ${selectedSaleDetail.property.streetNumber}`
                    : ''}
                </div>
                <div>
                  <span className="font-semibold">Category & Size: </span>
                  {selectedSaleDetail.property?.category} · {selectedSaleDetail.property?.sizeValue}{' '}
                  {selectedSaleDetail.property?.sizeUnit}
                </div>
                <div>
                  <span className="font-semibold">Sale Type: </span>
                  {selectedSaleDetail.sale.saleType}
                </div>
              </div>
            </div>

            {printMode === 'INVOICE' ? (
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="p-2.5 border-r border-slate-300">Description</th>
                    <th className="p-2.5 text-right">Amount ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="p-2.5 border-r border-slate-200">
                      Total Property Price ({selectedSaleDetail.property?.propertyNumber})
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {formatPKR(selectedSaleDetail.sale.totalPrice, currency)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="p-2.5 border-r border-slate-200">Less: Allowed Discount</td>
                    <td className="p-2.5 text-right font-mono">
                      {formatPKR(selectedSaleDetail.sale.discount, currency)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-300 bg-slate-50 font-bold">
                    <td className="p-2.5 border-r border-slate-300">Net Sale Amount</td>
                    <td className="p-2.5 text-right font-mono">
                      {formatPKR(selectedSaleDetail.sale.netSaleAmount, currency)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="p-2.5 border-r border-slate-200">Booking Amount Received</td>
                    <td className="p-2.5 text-right font-mono">
                      {formatPKR(selectedSaleDetail.sale.bookingAmount, currency)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="p-2.5 border-r border-slate-200">Down Payment Received</td>
                    <td className="p-2.5 text-right font-mono">
                      {formatPKR(selectedSaleDetail.sale.downPayment, currency)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-2.5 border-r border-slate-300">
                      Remaining Balance ({selectedSaleDetail.sale.durationMonths} Installments)
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {formatPKR(selectedSaleDetail.sale.remainingAmount, currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300">Inst #</th>
                    <th className="p-2 border-r border-slate-300">Due Date</th>
                    <th className="p-2 border-r border-slate-300 text-right">Amount</th>
                    <th className="p-2 border-r border-slate-300 text-right">Paid</th>
                    <th className="p-2 border-r border-slate-300 text-right">Balance</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSaleDetail.installments.map((inst: any) => (
                    <tr key={inst.id} className="border-b border-slate-200">
                      <td className="p-1.5 border-r border-slate-200 font-mono">
                        {inst.installmentNumber}
                      </td>
                      <td className="p-1.5 border-r border-slate-200 font-mono">{inst.dueDate}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                        {formatPKR(inst.installmentAmount, currency)}
                      </td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                        {formatPKR(inst.paidAmount, currency)}
                      </td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                        {formatPKR(inst.remainingAmount, currency)}
                      </td>
                      <td className="p-1.5 font-semibold">{inst.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </PrintDocumentModal>
      )}
    </div>
  );
}
