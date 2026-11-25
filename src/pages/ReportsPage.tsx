import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Printer, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToPDF, formatPKR } from '../lib/formatters';
import { PrintDocumentModal } from '../components/PrintDocumentModal';

export function ReportsPage() {
  const { apiFetch, settings } = useAuth();
  const [category, setCategory] = useState<'recovery' | 'sales' | 'inventory' | 'accounting'>(
    'recovery'
  );
  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
  );
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState('ALL');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const currency = settings?.currency || 'PKR';

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ category, fromDate, toDate });
      const res = await apiFetch(`/api/reports?${qs.toString()}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, category, fromDate, toDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const filteredRecoveryCustomers = useMemo(() => {
    const rows = data?.customerBalances || [];
    return rows.filter((c: any) => {
      if (subFilter === 'PENDING' && c.pendingBalance <= 0) return false;
      if (subFilter === 'OVERDUE' && c.overdueAmount <= 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          c.customerName.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          c.properties.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, subFilter, search]);

  const filteredSales = useMemo(() => {
    const rows = data?.sales || [];
    return rows.filter((s: any) => {
      if (subFilter === 'CASH' && s.saleType !== 'CASH') return false;
      if (subFilter === 'INSTALLMENT' && s.saleType !== 'INSTALLMENT') return false;
      if (subFilter === 'CANCELLED' && s.status !== 'Cancelled') return false;
      if (subFilter === 'PLOT' && s.propertyCategory === 'Shop') return false;
      if (subFilter === 'SHOP' && s.propertyCategory !== 'Shop') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.invoiceNumber.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.propertyNumber.toLowerCase().includes(q) ||
          s.block.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, subFilter, search]);

  const filteredInventory = useMemo(() => {
    const rows = data?.properties || [];
    return rows.filter((p: any) => {
      if (subFilter !== 'ALL' && p.bookingStatus !== subFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          p.propertyNumber.toLowerCase().includes(q) ||
          p.block.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, subFilter, search]);

  const filteredVouchers = useMemo(() => {
    const rows = data?.vouchers || [];
    return rows.filter((v: any) => {
      if (subFilter !== 'ALL' && v.voucherType !== subFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          v.voucherNumber.toLowerCase().includes(q) ||
          v.customerName.toLowerCase().includes(q) ||
          v.narration.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, subFilter, search]);

  const handleExcel = () => {
    if (category === 'recovery') {
      exportToExcel(
        'HAMA_NAGAR_Recovery_Aging_Report',
        'Recovery Aging',
        filteredRecoveryCustomers.map((c: any) => ({
          Code: c.customerCode,
          Customer: c.customerName,
          Properties: c.properties,
          Scheduled: c.totalScheduled,
          Recovered: c.totalPaid,
          Pending: c.pendingBalance,
          '1-30 Days': c.days1to30,
          '31-60 Days': c.days31to60,
          '61-90 Days': c.days61to90,
          '90+ Days': c.above90,
        }))
      );
    } else if (category === 'sales') {
      exportToExcel('HAMA_NAGAR_Sales_Report', 'Sales', filteredSales);
    } else if (category === 'inventory') {
      exportToExcel('HAMA_NAGAR_Inventory_Report', 'Inventory', filteredInventory);
    } else {
      exportToExcel('HAMA_NAGAR_Voucher_Register', 'Vouchers', filteredVouchers);
    }
  };

  const handlePDF = () => {
    if (category === 'recovery') {
      exportToPDF({
        title: 'Recovery & Aging Analysis Report',
        subtitle: `As of ${toDate}`,
        headers: ['Customer', 'Properties', 'Scheduled', 'Paid', 'Pending', '1-30d', '31-60d', '61-90d', '90+d'],
        rows: filteredRecoveryCustomers.map((c: any) => [
          c.customerName,
          c.properties,
          formatPKR(c.totalScheduled, currency),
          formatPKR(c.totalPaid, currency),
          formatPKR(c.pendingBalance, currency),
          formatPKR(c.days1to30, currency),
          formatPKR(c.days31to60, currency),
          formatPKR(c.days61to90, currency),
          formatPKR(c.above90, currency),
        ]),
        filename: 'HAMA_NAGAR_Recovery_Aging',
        settings,
        orientation: 'landscape',
      });
    } else if (category === 'sales') {
      exportToPDF({
        title: 'Sales Summary Report',
        subtitle: `${fromDate} to ${toDate} (${subFilter})`,
        headers: ['Invoice', 'Date', 'Type', 'Customer', 'Property', 'Block', 'Net Sale', 'Status'],
        rows: filteredSales.map((s: any) => [
          s.invoiceNumber,
          s.saleDate,
          s.saleType,
          s.customerName,
          s.propertyNumber,
          s.block,
          formatPKR(s.netSaleAmount, currency),
          s.status,
        ]),
        filename: 'HAMA_NAGAR_Sales_Report',
        settings,
        orientation: 'landscape',
      });
    } else if (category === 'inventory') {
      exportToPDF({
        title: 'Property Inventory Status Report',
        subtitle: `Status: ${subFilter}`,
        headers: ['Property No', 'Block', 'Category', 'Size', 'Price', 'Booking Status', 'Sale Status'],
        rows: filteredInventory.map((p: any) => [
          p.propertyNumber,
          p.block,
          p.category,
          `${p.sizeValue} ${p.sizeUnit}`,
          formatPKR(p.totalPrice, currency),
          p.bookingStatus,
          p.saleStatus,
        ]),
        filename: 'HAMA_NAGAR_Inventory_Report',
        settings,
        orientation: 'landscape',
      });
    } else {
      exportToPDF({
        title: 'Accounting Voucher Register',
        subtitle: `${fromDate} to ${toDate}`,
        headers: ['Voucher No', 'Type', 'Date', 'Party', 'Method', 'Amount', 'Status'],
        rows: filteredVouchers.map((v: any) => [
          v.voucherNumber,
          v.voucherType,
          v.voucherDate,
          v.customerName,
          v.paymentMethod,
          formatPKR(v.totalAmount, currency),
          v.status,
        ]),
        filename: 'HAMA_NAGAR_Voucher_Register',
        settings,
        orientation: 'landscape',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Management Reports Center</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Recovery aging analysis (1–30, 31–60, 61–90, 90+ days), sales breakdowns, inventory & registers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </button>
          <button
            onClick={handlePDF}
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

      {/* Category & Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-1">
          {[
            { id: 'recovery', label: 'Recovery & Aging Reports' },
            { id: 'sales', label: 'Sales Reports' },
            { id: 'inventory', label: 'Inventory / Property Reports' },
            { id: 'accounting', label: 'Receipt / Payment / JV Registers' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCategory(c.id as any);
                setSubFilter('ALL');
              }}
              className={`px-3.5 py-2 text-xs font-semibold rounded cursor-pointer ${
                category === c.id ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {c.label}
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
          <div>
            <label className="block text-slate-500 mb-1">Sub-Report Filter</label>
            <select
              value={subFilter}
              onChange={(e) => setSubFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
            >
              <option value="ALL">All Records</option>
              {category === 'recovery' && (
                <>
                  <option value="PENDING">Customers with Pending Balance</option>
                  <option value="OVERDUE">Overdue Accounts Only</option>
                </>
              )}
              {category === 'sales' && (
                <>
                  <option value="CASH">Cash Sales Only</option>
                  <option value="INSTALLMENT">Installment Sales Only</option>
                  <option value="PLOT">Plot-Wise Sales</option>
                  <option value="SHOP">Shop-Wise Sales</option>
                  <option value="CANCELLED">Cancelled Sales</option>
                </>
              )}
              {category === 'inventory' && (
                <>
                  <option value="Available">Available Properties</option>
                  <option value="Reserved">Reserved Properties</option>
                  <option value="Booked">Booked Properties</option>
                  <option value="Sold">Sold Properties</option>
                </>
              )}
              {category === 'accounting' && (
                <>
                  <option value="CRV">Cash Receipt Register (CRV)</option>
                  <option value="CPV">Cash Payment Register (CPV)</option>
                  <option value="JV">Journal Voucher Register (JV)</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label className="block text-slate-500 mb-1">Search</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Customer, Plot, Block, Invoice..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
              <button
                onClick={loadReport}
                className="px-3 py-2 bg-slate-900 text-white rounded-md cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recovery & Aging Summary Cards */}
      {category === 'recovery' && data?.summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Total Recoverable</div>
              <div className="text-base font-bold font-mono mt-1">
                {formatPKR(data.summary.totalRecoverable, currency)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Total Recovered</div>
              <div className="text-base font-bold font-mono text-emerald-700 mt-1">
                {formatPKR(data.summary.totalRecovered, currency)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Total Pending Recoveries</div>
              <div className="text-base font-bold font-mono text-amber-700 mt-1">
                {formatPKR(data.summary.totalPending, currency)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-xs text-slate-500">Recovery Percentage</div>
              <div className="text-base font-bold font-mono text-teal-700 mt-1">
                {data.summary.recoveryPercentage}%
              </div>
            </div>
          </div>

          {/* Aging Buckets Strip */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
            <div>
              <div className="text-slate-500">Not Yet Due</div>
              <div className="font-mono font-bold mt-1">
                {formatPKR(data.summary.aging.current, currency)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">1–30 Days Overdue</div>
              <div className="font-mono font-bold text-amber-700 mt-1">
                {formatPKR(data.summary.aging.days1to30, currency)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">31–60 Days Overdue</div>
              <div className="font-mono font-bold text-orange-700 mt-1">
                {formatPKR(data.summary.aging.days31to60, currency)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">61–90 Days Overdue</div>
              <div className="font-mono font-bold text-red-600 mt-1">
                {formatPKR(data.summary.aging.days61to90, currency)}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Above 90 Days Overdue</div>
              <div className="font-mono font-bold text-red-800 mt-1">
                {formatPKR(data.summary.aging.above90, currency)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Properties</th>
                    <th className="py-2.5 px-3 text-right">Scheduled</th>
                    <th className="py-2.5 px-3 text-right">Paid</th>
                    <th className="py-2.5 px-3 text-right">Pending</th>
                    <th className="py-2.5 px-3 text-right">1–30d</th>
                    <th className="py-2.5 px-3 text-right">31–60d</th>
                    <th className="py-2.5 px-3 text-right">61–90d</th>
                    <th className="py-2.5 px-3 text-right">90+d</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecoveryCustomers.map((c: any) => (
                    <tr key={c.customerId} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {c.customerCode} · {c.customerName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{c.properties}</td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatPKR(c.totalScheduled, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                        {formatPKR(c.totalPaid, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {formatPKR(c.pendingBalance, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                        {formatPKR(c.days1to30, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-orange-700">
                        {formatPKR(c.days31to60, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-red-600">
                        {formatPKR(c.days61to90, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-red-800">
                        {formatPKR(c.above90, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Sales Report Table */}
      {category === 'sales' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Invoice</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Property (Block)</th>
                  <th className="py-2.5 px-4 text-right">Net Sale</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.map((s: any) => (
                  <tr key={s.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{s.invoiceNumber}</td>
                    <td className="py-2.5 px-4 font-mono">{s.saleDate}</td>
                    <td className="py-2.5 px-4">{s.saleType}</td>
                    <td className="py-2.5 px-4">{s.customerName}</td>
                    <td className="py-2.5 px-4 font-mono">
                      {s.propertyNumber} ({s.block})
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">
                      {formatPKR(s.netSaleAmount, currency)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inventory Report Table */}
      {category === 'inventory' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Property No</th>
                  <th className="py-2.5 px-4">Block</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Size</th>
                  <th className="py-2.5 px-4 text-right">Price</th>
                  <th className="py-2.5 px-4">Booking Status</th>
                  <th className="py-2.5 px-4">Sale Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInventory.map((p: any) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{p.propertyNumber}</td>
                    <td className="py-2.5 px-4">{p.block}</td>
                    <td className="py-2.5 px-4">{p.category}</td>
                    <td className="py-2.5 px-4 font-mono">
                      {p.sizeValue} {p.sizeUnit}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {formatPKR(p.totalPrice, currency)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold">{p.bookingStatus}</td>
                    <td className="py-2.5 px-4">{p.saleStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Accounting Registers Table */}
      {category === 'accounting' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Voucher No</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Party / Customer</th>
                  <th className="py-2.5 px-4">Narration</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVouchers.map((v: any) => (
                  <tr key={v.id}>
                    <td className="py-2.5 px-4 font-mono font-semibold">{v.voucherNumber}</td>
                    <td className="py-2.5 px-4 font-mono">{v.voucherType}</td>
                    <td className="py-2.5 px-4 font-mono">{v.voucherDate}</td>
                    <td className="py-2.5 px-4">{v.customerName || '—'}</td>
                    <td className="py-2.5 px-4 max-w-xs truncate">{v.narration}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold">
                      {formatPKR(v.totalAmount, currency)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold">{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PrintDocumentModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title={`${category.toUpperCase()} MANAGEMENT REPORT`}
        documentDate={`${fromDate} to ${toDate}`}
        settings={settings}
      >
        <div className="text-xs text-slate-700">
          {category === 'recovery' ? (
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300">Customer</th>
                  <th className="p-2 border-r border-slate-300">Properties</th>
                  <th className="p-2 border-r border-slate-300 text-right">Paid</th>
                  <th className="p-2 border-r border-slate-300 text-right">Pending</th>
                  <th className="p-2 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecoveryCustomers.map((c: any) => (
                  <tr key={c.customerId} className="border-b border-slate-200">
                    <td className="p-1.5 border-r border-slate-200">{c.customerName}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono">{c.properties}</td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                      {formatPKR(c.totalPaid, currency)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                      {formatPKR(c.pendingBalance, currency)}
                    </td>
                    <td className="p-1.5 text-right font-mono">
                      {formatPKR(c.overdueAmount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : category === 'sales' ? (
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300">Invoice</th>
                  <th className="p-2 border-r border-slate-300">Date</th>
                  <th className="p-2 border-r border-slate-300">Customer</th>
                  <th className="p-2 border-r border-slate-300">Property</th>
                  <th className="p-2 text-right">Net Sale</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s: any) => (
                  <tr key={s.id} className="border-b border-slate-200">
                    <td className="p-1.5 border-r border-slate-200 font-mono">{s.invoiceNumber}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono">{s.saleDate}</td>
                    <td className="p-1.5 border-r border-slate-200">{s.customerName}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono">{s.propertyNumber}</td>
                    <td className="p-1.5 text-right font-mono">
                      {formatPKR(s.netSaleAmount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>Export PDF or Excel for complete multi-column tabular report output.</p>
          )}
        </div>
      </PrintDocumentModal>
    </div>
  );
}
