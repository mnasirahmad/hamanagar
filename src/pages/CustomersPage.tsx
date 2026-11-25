import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Eye, Pencil, Printer, FileSpreadsheet, FileText, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToPDF, formatDateDisplay, formatPKR } from '../lib/formatters';
import { PrintDocumentModal } from '../components/PrintDocumentModal';

interface Customer {
  id: number;
  customerCode: string;
  fullName: string;
  guardianName: string;
  cnic: string;
  mobile: string;
  whatsapp: string;
  address: string;
  city: string;
  nomineeName: string;
  nomineeCnic: string;
  registrationDate: string;
  remarks: string;
}

interface CustomerHistory {
  customer: Customer;
  sales: any[];
  installments: any[];
  vouchers: any[];
  summary: {
    totalPurchased: number;
    totalPaid: number;
    outstandingBalance: number;
  };
}

export function CustomersPage() {
  const { apiFetch, erpUser, settings } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const [historyData, setHistoryData] = useState<CustomerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [printStatementOpen, setPrintStatementOpen] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    guardianName: '',
    cnic: '',
    mobile: '',
    whatsapp: '',
    address: '',
    city: 'Vehari',
    nomineeName: '',
    nomineeCnic: '',
    registrationDate: new Date().toISOString().slice(0, 10),
    remarks: '',
  });

  const canEdit = erpUser?.role === 'admin' || erpUser?.role === 'sales';
  const currency = settings?.currency || 'PKR';

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetch<Customer[]>('/api/customers');
      setCustomers(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.customerCode.toLowerCase().includes(q) ||
        c.fullName.toLowerCase().includes(q) ||
        c.cnic.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      fullName: '',
      guardianName: '',
      cnic: '',
      mobile: '',
      whatsapp: '',
      address: '',
      city: 'Vehari',
      nomineeName: '',
      nomineeCnic: '',
      registrationDate: new Date().toISOString().slice(0, 10),
      remarks: '',
    });
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({
      fullName: c.fullName,
      guardianName: c.guardianName,
      cnic: c.cnic,
      mobile: c.mobile,
      whatsapp: c.whatsapp,
      address: c.address,
      city: c.city,
      nomineeName: c.nomineeName,
      nomineeCnic: c.nomineeCnic,
      registrationDate: c.registrationDate,
      remarks: c.remarks,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/api/customers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/customers', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      await loadCustomers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (c: Customer) => {
    setHistoryLoading(true);
    try {
      const data = await apiFetch<CustomerHistory>(`/api/customers/${c.id}/history`);
      setHistoryData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportExcel = () => {
    exportToExcel(
      'HAMA_NAGAR_Customers',
      'Customers',
      filtered.map((c) => ({
        'Customer ID': c.customerCode,
        Name: c.fullName,
        'Father/Husband': c.guardianName,
        CNIC: c.cnic,
        Mobile: c.mobile,
        WhatsApp: c.whatsapp,
        City: c.city,
        Address: c.address,
        Nominee: c.nomineeName,
        'Nominee CNIC': c.nomineeCnic,
        'Reg Date': c.registrationDate,
      }))
    );
  };

  const handleExportPDF = () => {
    exportToPDF({
      title: 'Registered Customers Directory',
      headers: ['ID', 'Customer Name', 'S/O or W/O', 'CNIC', 'Mobile', 'City', 'Reg Date'],
      rows: filtered.map((c) => [
        c.customerCode,
        c.fullName,
        c.guardianName,
        c.cnic,
        c.mobile,
        c.city,
        c.registrationDate,
      ]),
      filename: 'HAMA_NAGAR_Customers',
      settings,
      orientation: 'landscape',
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Customer Registration & History</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Maintain buyer profiles, CNIC/nominee records, purchased plots, and payment statements
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {canEdit && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Register Customer
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by Customer ID, Name, CNIC, Mobile, City..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-teal-700"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">No customers registered yet.</p>
            {canEdit && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Register First Customer
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Customer ID</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Father / Husband</th>
                  <th className="py-3 px-4">CNIC</th>
                  <th className="py-3 px-4">Mobile / WhatsApp</th>
                  <th className="py-3 px-4">City</th>
                  <th className="py-3 px-4">Reg Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono font-semibold text-teal-800">
                      {c.customerCode}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{c.fullName}</td>
                    <td className="py-2.5 px-4 text-slate-600">{c.guardianName}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{c.cnic}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{c.mobile}</td>
                    <td className="py-2.5 px-4 text-slate-600">{c.city}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {formatDateDisplay(c.registrationDate)}
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1">
                      <button
                        onClick={() => openHistory(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Profile & History
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                          title="Edit customer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
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

      {/* Add / Edit Customer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden my-4">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? `Edit Customer: ${editing.customerCode}` : 'New Customer Registration'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Father / Husband Name *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.guardianName}
                    onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    CNIC Number *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.cnic}
                    onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                    placeholder="36603-0000000-0"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="0300-0000000"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Residential Address *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nominee Name
                  </label>
                  <input
                    type="text"
                    value={form.nomineeName}
                    onChange={(e) => setForm({ ...form, nomineeName: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nominee CNIC
                  </label>
                  <input
                    type="text"
                    value={form.nomineeCnic}
                    onChange={(e) => setForm({ ...form, nomineeCnic: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Registration Date
                  </label>
                  <input
                    type="date"
                    value={form.registrationDate}
                    onChange={(e) => setForm({ ...form, registrationDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                  <input
                    type="text"
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                >
                  {saving ? 'Saving...' : editing ? 'Update Customer' : 'Register Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer 360 History Modal */}
      {(historyData || historyLoading) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden my-6">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {historyData
                    ? `${historyData.customer.customerCode} · ${historyData.customer.fullName}`
                    : 'Loading Customer Profile...'}
                </h3>
                {historyData && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    S/O or W/O: {historyData.customer.guardianName} · CNIC: {historyData.customer.cnic} · Mobile: {historyData.customer.mobile}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {historyData && (
                  <button
                    onClick={() => setPrintStatementOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Statement
                  </button>
                )}
                <button
                  onClick={() => setHistoryData(null)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {historyLoading || !historyData ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Loading purchases, installment schedules, and receipts...
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="border border-slate-200 rounded-md p-4">
                    <div className="text-xs text-slate-500">Total Purchased Value</div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                      {formatPKR(historyData.summary.totalPurchased, currency)}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-md p-4">
                    <div className="text-xs text-slate-500">Total Receipts Paid</div>
                    <div className="text-lg font-bold font-mono text-emerald-700 mt-1">
                      {formatPKR(historyData.summary.totalPaid, currency)}
                    </div>
                  </div>
                  <div className="border border-slate-200 rounded-md p-4">
                    <div className="text-xs text-slate-500">Outstanding Installment Balance</div>
                    <div className="text-lg font-bold font-mono text-amber-700 mt-1">
                      {formatPKR(historyData.summary.outstandingBalance, currency)}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Property Purchases ({historyData.sales.length})
                  </h4>
                  {historyData.sales.length === 0 ? (
                    <p className="text-xs text-slate-500">No properties purchased yet.</p>
                  ) : (
                    <table className="w-full text-left text-xs border border-slate-200">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Invoice</th>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Property</th>
                          <th className="p-2.5">Type</th>
                          <th className="p-2.5 text-right">Net Sale</th>
                          <th className="p-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyData.sales.map((s) => (
                          <tr key={s.id}>
                            <td className="p-2.5 font-mono font-semibold">{s.invoiceNumber}</td>
                            <td className="p-2.5 font-mono">{s.saleDate}</td>
                            <td className="p-2.5">
                              {s.property?.propertyNumber} ({s.property?.category})
                            </td>
                            <td className="p-2.5">{s.saleType}</td>
                            <td className="p-2.5 text-right font-mono">
                              {formatPKR(s.netSaleAmount, currency)}
                            </td>
                            <td className="p-2.5 font-semibold">{s.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Payment & Receipt History ({historyData.vouchers.length})
                  </h4>
                  {historyData.vouchers.length === 0 ? (
                    <p className="text-xs text-slate-500">No receipts posted yet.</p>
                  ) : (
                    <table className="w-full text-left text-xs border border-slate-200">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Voucher</th>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Category</th>
                          <th className="p-2.5">Method</th>
                          <th className="p-2.5 text-right">Amount</th>
                          <th className="p-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyData.vouchers.map((v) => (
                          <tr key={v.id}>
                            <td className="p-2.5 font-mono font-semibold">{v.voucherNumber}</td>
                            <td className="p-2.5 font-mono">{v.voucherDate}</td>
                            <td className="p-2.5">{v.receiptCategory || v.voucherType}</td>
                            <td className="p-2.5">{v.paymentMethod}</td>
                            <td className="p-2.5 text-right font-mono">
                              {formatPKR(v.totalAmount, currency)}
                            </td>
                            <td className="p-2.5 font-semibold">{v.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Printable Customer Statement */}
      {historyData && (
        <PrintDocumentModal
          open={printStatementOpen}
          onClose={() => setPrintStatementOpen(false)}
          title="Customer Account Statement"
          documentNumber={historyData.customer.customerCode}
          documentDate={new Date().toISOString().slice(0, 10)}
          settings={settings}
        >
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 p-4 rounded">
              <div>
                <div>
                  <span className="font-semibold">Customer: </span>
                  {historyData.customer.fullName} ({historyData.customer.customerCode})
                </div>
                <div>
                  <span className="font-semibold">Father / Husband: </span>
                  {historyData.customer.guardianName}
                </div>
                <div>
                  <span className="font-semibold">CNIC: </span>
                  <span className="font-mono">{historyData.customer.cnic}</span>
                </div>
              </div>
              <div>
                <div>
                  <span className="font-semibold">Mobile: </span>
                  <span className="font-mono">{historyData.customer.mobile}</span>
                </div>
                <div>
                  <span className="font-semibold">Address: </span>
                  {historyData.customer.address}, {historyData.customer.city}
                </div>
                <div>
                  <span className="font-semibold">Nominee: </span>
                  {historyData.customer.nomineeName || '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border border-slate-300 p-3 font-mono">
              <div>
                <div className="text-[11px] text-slate-500">Total Net Sales</div>
                <div className="font-bold">
                  {formatPKR(historyData.summary.totalPurchased, currency)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Total Amount Paid</div>
                <div className="font-bold text-emerald-700">
                  {formatPKR(historyData.summary.totalPaid, currency)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Outstanding Balance</div>
                <div className="font-bold text-red-700">
                  {formatPKR(historyData.summary.outstandingBalance, currency)}
                </div>
              </div>
            </div>

            {historyData.installments.length > 0 && (
              <div>
                <h4 className="font-bold mb-2">Installment Schedule</h4>
                <table className="w-full text-left border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300">
                      <th className="p-2 border-r border-slate-300">#</th>
                      <th className="p-2 border-r border-slate-300">Property</th>
                      <th className="p-2 border-r border-slate-300">Due Date</th>
                      <th className="p-2 border-r border-slate-300 text-right">Amount</th>
                      <th className="p-2 border-r border-slate-300 text-right">Paid</th>
                      <th className="p-2 border-r border-slate-300 text-right">Remaining</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.installments.map((inst) => (
                      <tr key={inst.id} className="border-b border-slate-200">
                        <td className="p-1.5 border-r border-slate-200 font-mono">
                          {inst.installmentNumber}
                        </td>
                        <td className="p-1.5 border-r border-slate-200">
                          {inst.property?.propertyNumber}
                        </td>
                        <td className="p-1.5 border-r border-slate-200 font-mono">
                          {inst.dueDate}
                        </td>
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
              </div>
            )}
          </div>
        </PrintDocumentModal>
      )}
    </div>
  );
}
