import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  Printer,
  Receipt,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToPDF, formatDateDisplay, formatPKR } from '../lib/formatters';
import { PrintDocumentModal } from '../components/PrintDocumentModal';

export function InstallmentsPage() {
  const { apiFetch, erpUser, settings } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Payment Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    voucherDate: new Date().toISOString().slice(0, 10),
    amountReceived: '0',
    lateFeeAmount: '0',
    cashBankAccountId: '',
    paymentMethod: 'Cash',
    receiptCategory: 'Installment',
    referenceNo: '',
    narration: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Reschedule Modal
  const [rescheduleItem, setRescheduleItem] = useState<any | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({
    dueDate: '',
    installmentAmount: '',
    lateFee: '0',
    remarks: '',
  });

  const [printOpen, setPrintOpen] = useState(false);
  const [printedVoucher, setPrintedVoucher] = useState<any | null>(null);

  const canRecover =
    erpUser?.role === 'admin' || erpUser?.role === 'accounts' || erpUser?.role === 'recovery';
  const currency = settings?.currency || 'PKR';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [instData, accData] = await Promise.all([
        apiFetch<any[]>('/api/installments'),
        apiFetch<any[]>('/api/accounts'),
      ]);
      setRows(instData);
      setAccounts(accData);
      const defaultCash = accData.find((a) => a.code === '1100');
      if (defaultCash) {
        setPayForm((prev) => ({
          ...prev,
          cashBankAccountId: prev.cashBankAccountId || String(defaultCash.id),
        }));
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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.customer?.fullName?.toLowerCase().includes(q) ||
          r.property?.propertyNumber?.toLowerCase().includes(q) ||
          r.sale?.invoiceNumber?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const toggleSelect = (inst: any) => {
    if (inst.status === 'Paid' || inst.status === 'Cancelled') return;
    setSelectedIds((prev) => {
      if (prev.includes(inst.id)) {
        return prev.filter((id) => id !== inst.id);
      }
      // Ensure selected installments belong to the same sale for clean multi-installment CRV
      if (prev.length > 0) {
        const first = rows.find((r) => r.id === prev[0]);
        if (first && first.saleId !== inst.saleId) {
          setError('Multi-installment receipt must belong to the same Sale Invoice.');
          return prev;
        }
      }
      setError(null);
      return [...prev, inst.id];
    });
  };

  const openReceivePayment = (singleInst?: any) => {
    const ids = singleInst ? [singleInst.id] : selectedIds;
    if (ids.length === 0) return;
    const selectedRows = rows.filter((r) => ids.includes(r.id));
    const totalRem = selectedRows.reduce((s, r) => s + Number(r.remainingAmount), 0);
    const first = selectedRows[0];
    if (singleInst) setSelectedIds([singleInst.id]);

    setPayForm((prev) => ({
      ...prev,
      amountReceived: totalRem.toFixed(2),
      lateFeeAmount: '0',
      receiptCategory: 'Installment',
      narration: `Installment #${selectedRows
        .map((r) => r.installmentNumber)
        .join(', ')} for ${first?.property?.propertyNumber || ''} (${first?.sale?.invoiceNumber || ''})`,
    }));
    setPayModalOpen(true);
  };

  const handlePostPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
      const first = selectedRows[0];
      if (!first) throw new Error('No installment selected.');

      const voucher = await apiFetch('/api/vouchers/crv', {
        method: 'POST',
        body: JSON.stringify({
          voucherDate: payForm.voucherDate,
          customerId: first.customerId,
          propertyId: first.propertyId,
          saleId: first.saleId,
          installmentIds: selectedIds,
          amountReceived: Number(payForm.amountReceived),
          lateFeeAmount: Number(payForm.lateFeeAmount || 0),
          cashBankAccountId: Number(payForm.cashBankAccountId),
          paymentMethod: payForm.paymentMethod,
          receiptCategory: payForm.receiptCategory,
          referenceNo: payForm.referenceNo,
          narration: payForm.narration,
          partyName: first.customer?.fullName || '',
        }),
      });

      setPayModalOpen(false);
      setSelectedIds([]);
      await loadData();
      setPrintedVoucher({
        ...voucher,
        customerName: first.customer?.fullName,
        propertyNumber: first.property?.propertyNumber,
        invoiceNumber: first.sale?.invoiceNumber,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openReschedule = (inst: any) => {
    setRescheduleItem(inst);
    setRescheduleForm({
      dueDate: inst.dueDate,
      installmentAmount: String(inst.installmentAmount),
      lateFee: String(inst.lateFee || '0'),
      remarks: inst.remarks || '',
    });
  };

  const handleSaveReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleItem) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/api/installments/reschedule', {
        method: 'POST',
        body: JSON.stringify({
          installmentId: rescheduleItem.id,
          ...rescheduleForm,
        }),
      });
      setRescheduleItem(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Installment Schedules & Recovery</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Track monthly dues, collect single/multi-installment receipts, partial/advance payments, and rescheduling
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRecover && selectedIds.length > 0 && (
            <button
              onClick={() => openReceivePayment()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              Collect Selected ({selectedIds.length})
            </button>
          )}
          <button
            onClick={() =>
              exportToExcel(
                'HAMA_NAGAR_Installment_Schedule',
                'Installments',
                filtered.map((i) => ({
                  Invoice: i.sale?.invoiceNumber,
                  Customer: i.customer?.fullName,
                  Property: i.property?.propertyNumber,
                  'Inst #': i.installmentNumber,
                  'Due Date': i.dueDate,
                  Amount: Number(i.installmentAmount),
                  Paid: Number(i.paidAmount),
                  Remaining: Number(i.remainingAmount),
                  'Payment Date': i.paymentDate,
                  Status: i.status,
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
                title: 'Installment Recovery Schedule',
                subtitle: `Status Filter: ${statusFilter}`,
                headers: ['Invoice', 'Customer', 'Property', '#', 'Due Date', 'Amount', 'Paid', 'Remaining', 'Status'],
                rows: filtered.map((i) => [
                  i.sale?.invoiceNumber || '',
                  i.customer?.fullName || '',
                  i.property?.propertyNumber || '',
                  i.installmentNumber,
                  i.dueDate,
                  formatPKR(i.installmentAmount, currency),
                  formatPKR(i.paidAmount, currency),
                  formatPKR(i.remainingAmount, currency),
                  i.status,
                ]),
                filename: 'HAMA_NAGAR_Installments',
                settings,
                orientation: 'landscape',
              })
            }
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search Customer, Plot No, or Invoice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-md">
          {['All', 'Overdue', 'Due', 'Partially Paid', 'Upcoming', 'Paid'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer whitespace-nowrap ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Loading installment schedules...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No installment records match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-3 w-8">Sel</th>
                  <th className="py-3 px-3">Invoice</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Property</th>
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-3 text-right">Paid</th>
                  <th className="py-3 px-3 text-right">Remaining</th>
                  <th className="py-3 px-3">Status</th>
                  {canRecover && <th className="py-3 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((i) => {
                  const statusColor =
                    i.status === 'Paid'
                      ? 'text-emerald-700'
                      : i.status === 'Overdue'
                      ? 'text-red-700'
                      : i.status === 'Partially Paid'
                      ? 'text-amber-700'
                      : i.status === 'Due'
                      ? 'text-teal-700'
                      : 'text-slate-600';
                  const isPayable = i.status !== 'Paid' && i.status !== 'Cancelled';
                  return (
                    <tr key={i.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        {isPayable && canRecover && (
                          <button
                            onClick={() => toggleSelect(i)}
                            className={`p-1 rounded cursor-pointer ${
                              selectedIds.includes(i.id) ? 'text-teal-700' : 'text-slate-300'
                            }`}
                            title="Select for batch receipt"
                          >
                            <CheckSquare className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {i.sale?.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {i.customer?.fullName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {i.property?.propertyNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{i.installmentNumber}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {formatDateDisplay(i.dueDate)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatPKR(i.installmentAmount, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {formatPKR(i.paidAmount, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                        {formatPKR(i.remainingAmount, currency)}
                      </td>
                      <td className={`py-2.5 px-3 font-semibold ${statusColor}`}>{i.status}</td>
                      {canRecover && (
                        <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                          {isPayable && (
                            <>
                              <button
                                onClick={() => openReceivePayment(i)}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded cursor-pointer"
                              >
                                Receive
                              </button>
                              <button
                                onClick={() => openReschedule(i)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                                title="Reschedule / Adjust"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Collect Payment Modal (Posts CRV) */}
      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Receive Installment Payment (CRV)
              </h3>
              <button
                onClick={() => setPayModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handlePostPayment} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Receipt Date *</label>
                  <input
                    required
                    type="date"
                    value={payForm.voucherDate}
                    onChange={(e) => setPayForm({ ...payForm, voucherDate: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Receipt Type</label>
                  <select
                    value={payForm.receiptCategory}
                    onChange={(e) => setPayForm({ ...payForm, receiptCategory: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="Installment">Monthly Installment</option>
                    <option value="Advance">Advance Installments</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Total Amount Received ({currency}) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={payForm.amountReceived}
                    onChange={(e) => setPayForm({ ...payForm, amountReceived: e.target.value })}
                    className="w-full px-3 py-2 font-mono font-bold border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Included Late Fee ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payForm.lateFeeAmount}
                    onChange={(e) => setPayForm({ ...payForm, lateFeeAmount: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Cash / Bank Account *
                  </label>
                  <select
                    required
                    value={payForm.cashBankAccountId}
                    onChange={(e) => setPayForm({ ...payForm, cashBankAccountId: e.target.value })}
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
                    value={payForm.paymentMethod}
                    onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online / JazzCash / EasyPaisa">Online</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Transaction / Cheque Reference
                </label>
                <input
                  type="text"
                  value={payForm.referenceNo}
                  onChange={(e) => setPayForm({ ...payForm, referenceNo: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Narration</label>
                <input
                  type="text"
                  value={payForm.narration}
                  onChange={(e) => setPayForm({ ...payForm, narration: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                >
                  {submitting ? 'Posting CRV...' : 'Post Receipt & Print'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Reschedule Installment #{rescheduleItem.installmentNumber}
              </h3>
              <button
                onClick={() => setRescheduleItem(null)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveReschedule} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">New Due Date *</label>
                <input
                  required
                  type="date"
                  value={rescheduleForm.dueDate}
                  onChange={(e) =>
                    setRescheduleForm({ ...rescheduleForm, dueDate: e.target.value })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Installment Amount ({currency}) *
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={rescheduleForm.installmentAmount}
                  onChange={(e) =>
                    setRescheduleForm({ ...rescheduleForm, installmentAmount: e.target.value })
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Remarks (Audit Log)</label>
                <input
                  type="text"
                  value={rescheduleForm.remarks}
                  onChange={(e) =>
                    setRescheduleForm({ ...rescheduleForm, remarks: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRescheduleItem(null)}
                  className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                >
                  {submitting ? 'Saving...' : 'Save Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable CRV Receipt after Collection */}
      {printedVoucher && (
        <PrintDocumentModal
          open={Boolean(printedVoucher)}
          onClose={() => setPrintedVoucher(null)}
          title="CASH RECEIPT VOUCHER (CRV)"
          documentNumber={printedVoucher.voucherNumber}
          documentDate={printedVoucher.voucherDate}
          settings={settings}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-4 border border-slate-300 p-4 bg-slate-50">
              <div>
                <div>
                  <span className="font-semibold">Received From: </span>
                  {printedVoucher.customerName || printedVoucher.partyName}
                </div>
                <div>
                  <span className="font-semibold">Property: </span>
                  <span className="font-mono">{printedVoucher.propertyNumber || '—'}</span>
                </div>
                <div>
                  <span className="font-semibold">Sale Invoice: </span>
                  <span className="font-mono">{printedVoucher.invoiceNumber || '—'}</span>
                </div>
              </div>
              <div>
                <div>
                  <span className="font-semibold">Category: </span>
                  {printedVoucher.receiptCategory}
                </div>
                <div>
                  <span className="font-semibold">Payment Method: </span>
                  {printedVoucher.paymentMethod}
                </div>
                <div>
                  <span className="font-semibold">Reference No: </span>
                  <span className="font-mono">{printedVoucher.referenceNo || '—'}</span>
                </div>
              </div>
            </div>
            <table className="w-full border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2.5 border-r border-slate-300 text-left">Particulars / Narration</th>
                  <th className="p-2.5 text-right">Amount ({currency})</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-3 border-r border-slate-300">{printedVoucher.narration}</td>
                  <td className="p-3 text-right font-mono font-bold text-sm">
                    {formatPKR(printedVoucher.totalAmount, currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </PrintDocumentModal>
      )}

      {/* Printable Schedule List */}
      <PrintDocumentModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="INSTALLMENT RECOVERY SCHEDULE"
        documentDate={new Date().toISOString().slice(0, 10)}
        settings={settings}
      >
        <table className="w-full text-left border-collapse border border-slate-300 text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="p-2 border-r border-slate-300">Invoice</th>
              <th className="p-2 border-r border-slate-300">Customer</th>
              <th className="p-2 border-r border-slate-300">Property</th>
              <th className="p-2 border-r border-slate-300">#</th>
              <th className="p-2 border-r border-slate-300">Due Date</th>
              <th className="p-2 border-r border-slate-300 text-right">Amount</th>
              <th className="p-2 border-r border-slate-300 text-right">Remaining</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-b border-slate-200">
                <td className="p-1.5 border-r border-slate-200 font-mono">
                  {i.sale?.invoiceNumber}
                </td>
                <td className="p-1.5 border-r border-slate-200">{i.customer?.fullName}</td>
                <td className="p-1.5 border-r border-slate-200 font-mono">
                  {i.property?.propertyNumber}
                </td>
                <td className="p-1.5 border-r border-slate-200 font-mono">{i.installmentNumber}</td>
                <td className="p-1.5 border-r border-slate-200 font-mono">{i.dueDate}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  {formatPKR(i.installmentAmount, currency)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  {formatPKR(i.remainingAmount, currency)}
                </td>
                <td className="p-1.5 font-semibold">{i.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintDocumentModal>
    </div>
  );
}
