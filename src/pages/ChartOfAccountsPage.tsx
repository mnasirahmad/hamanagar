import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatPKR } from '../lib/formatters';

export function ChartOfAccountsPage() {
  const { apiFetch, erpUser, settings } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: '',
    name: '',
    parentId: '',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    openingBalance: '0',
    isActive: true,
  });

  const canEdit = erpUser?.role === 'admin' || erpUser?.role === 'accounts';
  const currency = settings?.currency || 'PKR';

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiFetch<any[]>('/api/accounts');
      setAccounts(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const parentOptions = useMemo(() => accounts, [accounts]);
  const accMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const filtered = useMemo(() => {
    if (typeFilter === 'ALL') return accounts;
    return accounts.filter((a) => a.accountType === typeFilter);
  }, [accounts, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    const defaultParent = accounts.find((a) => a.code === '5000');
    setForm({
      code: '',
      name: '',
      parentId: defaultParent ? String(defaultParent.id) : '',
      accountType: 'EXPENSE',
      normalBalance: 'DEBIT',
      openingBalance: '0',
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (acc: any) => {
    setEditing(acc);
    setForm({
      code: acc.code,
      name: acc.name,
      parentId: acc.parentId ? String(acc.parentId) : '',
      accountType: acc.accountType,
      normalBalance: acc.normalBalance,
      openingBalance: String(acc.openingBalance),
      isActive: acc.isActive,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/api/accounts/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch('/api/accounts', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      setModalOpen(false);
      await loadAccounts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Chart of Accounts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hierarchical general ledger structure across Assets, Liabilities, Capital, Income, and Expenses
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Account / Subaccount
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap gap-1">
        {['ALL', 'ASSET', 'LIABILITY', 'CAPITAL', 'INCOME', 'EXPENSE'].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
              typeFilter === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t === 'ALL' ? 'All Account Groups' : t}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading chart of accounts...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Parent Account</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Nature</th>
                  <th className="py-3 px-4 text-right">Opening Bal</th>
                  <th className="py-3 px-4 text-right">Current Balance</th>
                  <th className="py-3 px-4">Status</th>
                  {canEdit && <th className="py-3 px-4 text-right">Edit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((a) => {
                  const isRoot = a.parentId === null;
                  const parent = a.parentId ? accMap.get(a.parentId) : null;
                  return (
                    <tr
                      key={a.id}
                      className={isRoot ? 'bg-slate-50/80 font-semibold' : 'hover:bg-slate-50/70'}
                    >
                      <td className="py-2.5 px-4 font-mono text-slate-900">{a.code}</td>
                      <td className={`py-2.5 px-4 text-slate-900 ${!isRoot ? 'pl-8' : ''}`}>
                        {a.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">
                        {parent ? `${parent.code} · ${parent.name}` : '— (Level 1 Root)'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{a.accountType}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-600">{a.normalBalance}</td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {formatPKR(a.openingBalance, currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                        {isRoot ? '—' : formatPKR(a.currentBalance, currency)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={a.isActive ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                          {a.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => openEdit(a)}
                            className="p-1.5 text-slate-500 hover:text-teal-700 rounded hover:bg-slate-100 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? `Edit Account: ${editing.code}` : 'New Account / Subaccount'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Account Code *</label>
                  <input
                    required
                    disabled={Boolean(editing)}
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="e.g. 5800"
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Account Name *</label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Site Security Expenses"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Parent Account</label>
                  <select
                    value={form.parentId}
                    onChange={(e) => {
                      const p = accounts.find((a) => String(a.id) === e.target.value);
                      setForm({
                        ...form,
                        parentId: e.target.value,
                        accountType: p ? p.accountType : form.accountType,
                        normalBalance: p ? p.normalBalance : form.normalBalance,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="">None (Level 1 Header)</option>
                    {parentOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Account Type *</label>
                  <select
                    disabled={Boolean(editing)}
                    value={form.accountType}
                    onChange={(e) => {
                      const t = e.target.value;
                      setForm({
                        ...form,
                        accountType: t,
                        normalBalance: t === 'ASSET' || t === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
                  >
                    <option value="ASSET">ASSET</option>
                    <option value="LIABILITY">LIABILITY</option>
                    <option value="CAPITAL">CAPITAL</option>
                    <option value="INCOME">INCOME</option>
                    <option value="EXPENSE">EXPENSE</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Debit / Credit Nature *
                  </label>
                  <select
                    disabled={Boolean(editing)}
                    value={form.normalBalance}
                    onChange={(e) => setForm({ ...form, normalBalance: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
                  >
                    <option value="DEBIT">DEBIT</option>
                    <option value="CREDIT">CREDIT</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Opening Balance ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.openingBalance}
                    onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span>Account Active for Transactions</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 font-medium text-slate-700 bg-white border border-slate-200 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
