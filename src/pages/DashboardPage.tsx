import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ArrowUpRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatDateDisplay, formatPKR } from '../lib/formatters';

interface DashboardData {
  kpis: {
    totalPlots: number;
    totalShops: number;
    availableProperties: number;
    bookedProperties: number;
    soldProperties: number;
    totalSalesAmount: number;
    totalCashSales: number;
    totalInstallmentSales: number;
    totalAmountReceived: number;
    totalPendingRecoveries: number;
    monthlyInstallmentRecovery: number;
    overdueInstallmentsCount: number;
    overdueInstallmentsAmount: number;
    totalCustomers: number;
    todaysCashReceipts: number;
    todaysCashPayments: number;
    monthlyIncome: number;
    monthlyExpenses: number;
  };
  monthlySeries: {
    month: string;
    sales: number;
    recoveries: number;
    payments: number;
    pending: number;
  }[];
  propertyBreakdown: Record<string, number>;
  recentVouchers: {
    id: number;
    voucherNumber: string;
    voucherType: string;
    voucherDate: string;
    partyName: string;
    totalAmount: string;
    status: string;
    narration: string;
  }[];
}

export function DashboardPage({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { apiFetch, settings } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const currency = settings?.currency || 'PKR';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-6 text-sm text-red-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
        <button
          onClick={loadDashboard}
          className="px-3 py-1.5 text-xs font-medium bg-red-50 hover:bg-red-100 rounded border border-red-200 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const kpis = data?.kpis;
  const series = data?.monthlySeries || [];
  const maxChartVal = Math.max(
    1000,
    ...series.flatMap((s) => [s.sales, s.recoveries, s.payments, s.pending])
  );

  const breakdownEntries = Object.entries(data?.propertyBreakdown || {});
  const totalPropsCount = breakdownEntries.reduce((acc, [, v]) => acc + v, 0);

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Executive Overview
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time property inventory, installment recoveries, and general ledger summary
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDashboard}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
          <button
            onClick={() => onNavigate('sales')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            New Property Sale
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (16 Metrics organized into 4 clean structural groups) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Inventory Group */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Inventory Status
            </span>
            <button
              onClick={() => onNavigate('properties')}
              className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4">
            <div>
              <div className="text-xs text-slate-500">Total Plots</div>
              <div className="text-lg font-bold font-mono text-slate-900">
                {kpis?.totalPlots ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Shops</div>
              <div className="text-lg font-bold font-mono text-slate-900">
                {kpis?.totalShops ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Available</div>
              <div className="text-base font-semibold font-mono text-emerald-700">
                {kpis?.availableProperties ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Booked / Sold</div>
              <div className="text-base font-semibold font-mono text-slate-800">
                {kpis?.bookedProperties ?? 0} / {kpis?.soldProperties ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Sales Volume Group */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Sales Portfolio
            </span>
            <button
              onClick={() => onNavigate('sales')}
              className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
            >
              Sales Register
            </button>
          </div>
          <div className="space-y-2.5">
            <div>
              <div className="text-xs text-slate-500">Total Sales Amount</div>
              <div className="text-lg font-bold font-mono text-slate-900">
                {formatPKR(kpis?.totalSalesAmount, currency)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <div className="text-xs text-slate-500">Cash Sales</div>
                <div className="text-xs font-semibold font-mono text-slate-800 mt-0.5">
                  {formatPKR(kpis?.totalCashSales, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Installment Sales</div>
                <div className="text-xs font-semibold font-mono text-slate-800 mt-0.5">
                  {formatPKR(kpis?.totalInstallmentSales, currency)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recoveries & Receivables Group */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Recoveries & Dues
            </span>
            <button
              onClick={() => onNavigate('installments')}
              className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
            >
              Schedules
            </button>
          </div>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500">Total Received</div>
                <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">
                  {formatPKR(kpis?.totalAmountReceived, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pending Recoveries</div>
                <div className="text-sm font-bold font-mono text-amber-700 mt-0.5">
                  {formatPKR(kpis?.totalPendingRecoveries, currency)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <div className="text-xs text-slate-500">Monthly Recovery</div>
                <div className="text-xs font-semibold font-mono text-slate-800 mt-0.5">
                  {formatPKR(kpis?.monthlyInstallmentRecovery, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Overdue ({kpis?.overdueInstallmentsCount ?? 0})</div>
                <div className="text-xs font-semibold font-mono text-red-700 mt-0.5">
                  {formatPKR(kpis?.overdueInstallmentsAmount, currency)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Daily Cash & Monthly P&L Group */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Treasury & Customers
            </span>
            <button
              onClick={() => onNavigate('customers')}
              className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
            >
              {kpis?.totalCustomers ?? 0} Customers
            </button>
          </div>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500">Today Receipts</div>
                <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">
                  {formatPKR(kpis?.todaysCashReceipts, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Today Payments</div>
                <div className="text-sm font-bold font-mono text-slate-800 mt-0.5">
                  {formatPKR(kpis?.todaysCashPayments, currency)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div>
                <div className="text-xs text-slate-500">Month Income</div>
                <div className="text-xs font-semibold font-mono text-teal-700 mt-0.5">
                  {formatPKR(kpis?.monthlyIncome, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Month Expenses</div>
                <div className="text-xs font-semibold font-mono text-red-700 mt-0.5">
                  {formatPKR(kpis?.monthlyExpenses, currency)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Sales, Recoveries, Cash Flow & Pending Bar Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                6-Month Sales, Recoveries & Cash Flow
              </h3>
              <p className="text-xs text-slate-500">
                Monthly comparison of new sales, cash receipts, disbursements, and pending dues
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-slate-800 inline-block rounded-xs" /> Sales
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-teal-600 inline-block rounded-xs" /> Recoveries
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-500 inline-block rounded-xs" /> Pending
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-rose-500 inline-block rounded-xs" /> Payments
              </span>
            </div>
          </div>

          <div className="relative h-64 w-full">
            <svg viewBox="0 0 660 220" className="w-full h-full overflow-visible">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = 185 - ratio * 160;
                return (
                  <g key={idx}>
                    <line
                      x1="48"
                      y1={y}
                      x2="650"
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="3 3"
                    />
                    <text
                      x="42"
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-400 text-[9px] font-mono"
                    >
                      {Math.round((maxChartVal * ratio) / 1000)}k
                    </text>
                  </g>
                );
              })}

              {series.map((item, idx) => {
                const groupX = 72 + idx * 96;
                const barW = 14;
                const bars = [
                  { val: item.sales, color: '#1e293b', label: 'Sales' },
                  { val: item.recoveries, color: '#0d9488', label: 'Recoveries' },
                  { val: item.pending, color: '#f59e0b', label: 'Pending' },
                  { val: item.payments, color: '#f43f5e', label: 'Payments' },
                ];

                return (
                  <g
                    key={item.month}
                    onMouseEnter={() => setHoveredMonth(idx)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={groupX - 6}
                      y={18}
                      width={76}
                      height={172}
                      fill={hoveredMonth === idx ? '#f8fafc' : 'transparent'}
                      rx="4"
                    />
                    {bars.map((b, bIdx) => {
                      const h = Math.max(2, (b.val / maxChartVal) * 160);
                      return (
                        <rect
                          key={bIdx}
                          x={groupX + bIdx * (barW + 3)}
                          y={185 - h}
                          width={barW}
                          height={h}
                          fill={b.color}
                          rx="2"
                        />
                      );
                    })}
                    <text
                      x={groupX + 32}
                      y={204}
                      textAnchor="middle"
                      className="fill-slate-600 text-[10px] font-mono"
                    >
                      {item.month}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hoveredMonth !== null && series[hoveredMonth] && (
              <div className="absolute top-2 right-2 bg-slate-900 text-white text-xs rounded-md px-3 py-2 shadow-lg pointer-events-none space-y-1 font-mono">
                <div className="font-semibold text-slate-200 border-b border-slate-700 pb-1">
                  {series[hoveredMonth].month}
                </div>
                <div>Sales: {formatPKR(series[hoveredMonth].sales, currency)}</div>
                <div className="text-teal-300">
                  Recoveries: {formatPKR(series[hoveredMonth].recoveries, currency)}
                </div>
                <div className="text-amber-300">
                  Pending: {formatPKR(series[hoveredMonth].pending, currency)}
                </div>
                <div className="text-rose-300">
                  Payments: {formatPKR(series[hoveredMonth].payments, currency)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Property Allocation Breakdown */}
        <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Property Status Mix</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Distribution across {totalPropsCount} registered plots & shops
            </p>
          </div>

          <div className="space-y-3 my-4">
            {breakdownEntries.map(([status, count]) => {
              const pct = totalPropsCount > 0 ? Math.round((count / totalPropsCount) * 100) : 0;
              const barColor =
                status === 'Available'
                  ? 'bg-emerald-600'
                  : status === 'Booked'
                  ? 'bg-teal-600'
                  : status === 'Sold'
                  ? 'bg-slate-800'
                  : status === 'Reserved'
                  ? 'bg-amber-500'
                  : 'bg-slate-400';

              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{status}</span>
                    <span className="font-mono text-slate-600">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-xs overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Net Monthly Position</span>
            <span
              className={`font-mono font-semibold ${
                (kpis?.monthlyIncome ?? 0) - (kpis?.monthlyExpenses ?? 0) >= 0
                  ? 'text-emerald-700'
                  : 'text-red-700'
              }`}
            >
              {formatPKR((kpis?.monthlyIncome ?? 0) - (kpis?.monthlyExpenses ?? 0), currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Vouchers */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Posted Vouchers</h3>
            <p className="text-xs text-slate-500">
              Latest receipts, disbursements, sales recognitions, and journal entries
            </p>
          </div>
          <button
            onClick={() => onNavigate('vouchers')}
            className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
          >
            Open Vouchers Module
          </button>
        </div>

        {data?.recentVouchers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No transactions recorded yet. Add properties, register customers, or record a voucher to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Voucher No</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Party / Narration</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {data?.recentVouchers.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                      {v.voucherNumber}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{v.voucherType}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {formatDateDisplay(v.voucherDate)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 max-w-md truncate">
                      {v.partyName ? `${v.partyName} — ` : ''}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
