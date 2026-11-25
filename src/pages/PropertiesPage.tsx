import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Printer, FileSpreadsheet, FileText, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToPDF, formatPKR } from '../lib/formatters';
import { PrintDocumentModal } from '../components/PrintDocumentModal';

interface Property {
  id: number;
  propertyNumber: string;
  block: string;
  streetNumber: string;
  category: string;
  sizeValue: string;
  sizeUnit: string;
  location: string;
  totalPrice: string;
  bookingStatus: string;
  saleStatus: string;
  remarks: string;
}

const CATEGORIES = ['Residential Plot', 'Commercial Plot', 'Shop', 'Other'];
const SIZE_UNITS = ['Marla', 'Kanal', 'Sq Ft'];
const STATUSES = ['Available', 'Reserved', 'Booked', 'Sold', 'Cancelled', 'Transferred'];

export function PropertiesPage() {
  const { apiFetch, erpUser, settings } = useAuth();
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [blockFilter, setBlockFilter] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    propertyNumber: '',
    block: 'Block A',
    streetNumber: '',
    category: 'Residential Plot',
    sizeValue: '5',
    sizeUnit: 'Marla',
    location: '',
    totalPrice: '',
    bookingStatus: 'Available',
    saleStatus: 'Unsold',
    remarks: '',
  });

  const canEdit = erpUser?.role === 'admin' || erpUser?.role === 'sales';
  const currency = settings?.currency || 'PKR';

  const loadProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Property[]>('/api/properties');
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const blocks = useMemo(
    () => ['All', ...Array.from(new Set(items.map((p) => p.block).filter(Boolean)))],
    [items]
  );

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
      if (statusFilter !== 'All' && p.bookingStatus !== statusFilter) return false;
      if (blockFilter !== 'All' && p.block !== blockFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          p.propertyNumber.toLowerCase().includes(q) ||
          p.block.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          p.streetNumber.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, categoryFilter, statusFilter, blockFilter, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      propertyNumber: '',
      block: 'Block A',
      streetNumber: '',
      category: 'Residential Plot',
      sizeValue: '5',
      sizeUnit: 'Marla',
      location: '',
      totalPrice: '',
      bookingStatus: 'Available',
      saleStatus: 'Unsold',
      remarks: '',
    });
    setModalOpen(true);
  };

  const openEdit = (p: Property) => {
    setEditing(p);
    setForm({
      propertyNumber: p.propertyNumber,
      block: p.block,
      streetNumber: p.streetNumber,
      category: p.category,
      sizeValue: String(p.sizeValue),
      sizeUnit: p.sizeUnit,
      location: p.location,
      totalPrice: String(p.totalPrice),
      bookingStatus: p.bookingStatus,
      saleStatus: p.saleStatus,
      remarks: p.remarks,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/api/properties/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/properties', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      await loadProperties();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Property) => {
    try {
      await apiFetch(`/api/properties/${p.id}`, { method: 'DELETE' });
      await loadProperties();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExportExcel = () => {
    exportToExcel(
      'HAMA_NAGAR_Properties_Inventory',
      'Properties',
      filtered.map((p) => ({
        'Property No': p.propertyNumber,
        Block: p.block,
        Street: p.streetNumber,
        Category: p.category,
        Size: `${p.sizeValue} ${p.sizeUnit}`,
        Location: p.location,
        'Total Price': Number(p.totalPrice),
        'Booking Status': p.bookingStatus,
        'Sale Status': p.saleStatus,
        Remarks: p.remarks,
      }))
    );
  };

  const handleExportPDF = () => {
    const totalVal = filtered.reduce((acc, p) => acc + Number(p.totalPrice), 0);
    exportToPDF({
      title: 'Property Inventory & Availability Report',
      subtitle: `Filter: ${categoryFilter} · Status: ${statusFilter} · Block: ${blockFilter}`,
      headers: ['Property No', 'Block', 'Street', 'Category', 'Size', 'Price', 'Status'],
      rows: filtered.map((p) => [
        p.propertyNumber,
        p.block,
        p.streetNumber || '—',
        p.category,
        `${p.sizeValue} ${p.sizeUnit}`,
        formatPKR(p.totalPrice, currency),
        p.bookingStatus,
      ]),
      totalsRow: ['Total', `${filtered.length} Units`, '', '', '', formatPKR(totalVal, currency), ''],
      filename: 'HAMA_NAGAR_Property_Inventory',
      settings,
      orientation: 'landscape',
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Property & Plot Inventory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Residential plots, commercial plots, and shops availability & pricing registry
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
          <button
            onClick={() => setPrintOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          {canEdit && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Property
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search Plot/Shop No, Block, Location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-teal-700"
        >
          <option value="All">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={blockFilter}
          onChange={(e) => setBlockFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-teal-700"
        >
          {blocks.map((b) => (
            <option key={b} value={b}>
              {b === 'All' ? 'All Blocks / Sectors' : b}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-teal-700"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading property registry...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-600">No properties match the selected criteria.</p>
            {canEdit && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Register First Plot / Shop
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Property No</th>
                  <th className="py-3 px-4">Block / Street</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-right">Total Price</th>
                  <th className="py-3 px-4">Booking Status</th>
                  <th className="py-3 px-4">Sale Status</th>
                  {canEdit && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((p) => {
                  const statusColor =
                    p.bookingStatus === 'Available'
                      ? 'text-emerald-700'
                      : p.bookingStatus === 'Booked'
                      ? 'text-teal-700'
                      : p.bookingStatus === 'Sold'
                      ? 'text-slate-900'
                      : p.bookingStatus === 'Reserved'
                      ? 'text-amber-700'
                      : 'text-red-700';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        {p.propertyNumber}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {p.block}
                        {p.streetNumber ? ` · St ${p.streetNumber}` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{p.category}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">
                        {p.sizeValue} {p.sizeUnit}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 max-w-[180px] truncate">
                        {p.location || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                        {formatPKR(p.totalPrice, currency)}
                      </td>
                      <td className={`py-2.5 px-4 font-semibold ${statusColor}`}>
                        {p.bookingStatus}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{p.saleStatus}</td>
                      {canEdit && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 text-slate-500 hover:text-teal-700 rounded hover:bg-slate-100 cursor-pointer"
                            title="Edit property"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {erpUser?.role === 'admin' && p.saleStatus === 'Unsold' && (
                            <button
                              onClick={() => handleDelete(p)}
                              className="p-1.5 text-slate-500 hover:text-red-700 rounded hover:bg-red-50 cursor-pointer"
                              title="Delete property"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {/* Add / Edit Property Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? `Edit Property: ${editing.propertyNumber}` : 'Register New Property'}
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
                    Property ID / Plot Number *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.propertyNumber}
                    onChange={(e) => setForm({ ...form, propertyNumber: e.target.value })}
                    placeholder="e.g. A-101, SHP-05"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:border-teal-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Property Category *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Block / Sector *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.block}
                    onChange={(e) => setForm({ ...form, block: e.target.value })}
                    placeholder="e.g. Block A"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Street Number
                  </label>
                  <input
                    type="text"
                    value={form.streetNumber}
                    onChange={(e) => setForm({ ...form, streetNumber: e.target.value })}
                    placeholder="e.g. 04"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Size Value *
                    </label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={form.sizeValue}
                      onChange={(e) => setForm({ ...form, sizeValue: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Unit *</label>
                    <select
                      value={form.sizeUnit}
                      onChange={(e) => setForm({ ...form, sizeUnit: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
                    >
                      {SIZE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Total Price ({currency}) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={form.totalPrice}
                    onChange={(e) => setForm({ ...form, totalPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Location / Facing
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Main Boulevard Corner, Park Facing"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Booking Status
                  </label>
                  <select
                    value={form.bookingStatus}
                    onChange={(e) => setForm({ ...form, bookingStatus: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Saving...' : editing ? 'Update Property' : 'Save Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Availability Report */}
      <PrintDocumentModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Property Availability & Inventory List"
        documentDate={new Date().toISOString().slice(0, 10)}
        settings={settings}
      >
        <table className="w-full text-left border-collapse text-xs border border-slate-300">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="p-2 border-r border-slate-300">Property No</th>
              <th className="p-2 border-r border-slate-300">Block / Street</th>
              <th className="p-2 border-r border-slate-300">Category</th>
              <th className="p-2 border-r border-slate-300">Size</th>
              <th className="p-2 border-r border-slate-300 text-right">Total Price</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-200">
                <td className="p-2 border-r border-slate-200 font-mono font-semibold">
                  {p.propertyNumber}
                </td>
                <td className="p-2 border-r border-slate-200">
                  {p.block} {p.streetNumber ? `· St ${p.streetNumber}` : ''}
                </td>
                <td className="p-2 border-r border-slate-200">{p.category}</td>
                <td className="p-2 border-r border-slate-200 font-mono">
                  {p.sizeValue} {p.sizeUnit}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono">
                  {formatPKR(p.totalPrice, currency)}
                </td>
                <td className="p-2 font-semibold">{p.bookingStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintDocumentModal>
    </div>
  );
}
