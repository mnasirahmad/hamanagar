import React, { useCallback, useEffect, useState } from 'react';
import { Download, Upload, Save, ShieldCheck, Activity, Building2 } from 'lucide-react';
import { useAuth, UserRole } from '../context/AuthContext';

export function SettingsAndAdminPage() {
  const { apiFetch, erpUser, settings, refreshProfile } = useAuth();
  const [tab, setTab] = useState<'SETTINGS' | 'USERS' | 'AUDIT' | 'BACKUP'>('SETTINGS');

  const [form, setForm] = useState({
    companyName: settings?.companyName || 'HAMA NAGAR',
    subtitle: settings?.subtitle || 'Housing Society – Plot & Shop Sales Management',
    address: settings?.address || '',
    phone: settings?.phone || '',
    logoUrl: settings?.logoUrl || '',
    financialYearStart: settings?.financialYearStart || '2026-07-01',
    financialYearEnd: settings?.financialYearEnd || '2027-06-30',
    currency: settings?.currency || 'PKR',
    invoicePrefix: settings?.invoicePrefix || 'INV',
    crvPrefix: settings?.crvPrefix || 'CRV',
    cpvPrefix: settings?.cpvPrefix || 'CPV',
    jvPrefix: settings?.jvPrefix || 'JV',
    defaultInstallmentMonths: String(settings?.defaultInstallmentMonths || 36),
    lateFeePercent: String(settings?.lateFeePercent || '2.00'),
    gracePeriodDays: String(settings?.gracePeriodDays || 10),
    receiptTerms: settings?.receiptTerms || '',
    printFooter: settings?.printFooter || 'Powered by: Prime Soft Vehari',
  });

  const [usersList, setUsersList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isAdmin = erpUser?.role === 'admin';

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [uRows, aRows] = await Promise.all([
        apiFetch<any[]>('/api/users'),
        apiFetch<any[]>('/api/audit-logs'),
      ]);
      setUsersList(uRows);
      setAuditLogs(aRows);
    } catch (err: any) {
      setError(err.message);
    }
  }, [apiFetch, isAdmin]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      await refreshProfile();
      setMessage('Company settings updated successfully.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId: number, role: UserRole, isActive: boolean) => {
    setError(null);
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role, isActive }),
      });
      await loadAdminData();
      setMessage('User permissions updated.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDownloadBackup = async () => {
    setError(null);
    try {
      const backup = await apiFetch('/api/backup');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HAMA_NAGAR_ERP_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Database backup downloaded successfully.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRestoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await apiFetch('/api/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      await refreshProfile();
      await loadAdminData();
      setMessage('Database restored from backup successfully.');
    } catch (err: any) {
      setError(err.message || 'Restore failed.');
    }
    e.target.value = '';
  };

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-600">
        Administrator privileges are required to modify Company Settings, User Roles, and Database Backups.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Company Settings, Users & Database Administration
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure HAMA NAGAR company profile, numbering rules, role-based access, audit logs, and backups
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-wrap gap-1">
        <button
          onClick={() => setTab('SETTINGS')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded cursor-pointer ${
            tab === 'SETTINGS' ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" /> Company Settings
        </button>
        <button
          onClick={() => setTab('USERS')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded cursor-pointer ${
            tab === 'USERS' ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> User Roles & Access
        </button>
        <button
          onClick={() => setTab('AUDIT')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded cursor-pointer ${
            tab === 'AUDIT' ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-3.5 h-3.5" /> Audit Trail
        </button>
        <button
          onClick={() => setTab('BACKUP')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded cursor-pointer ${
            tab === 'BACKUP' ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Download className="w-3.5 h-3.5" /> Backup & Restore
        </button>
      </div>

      {message && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-md text-xs font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-xs">
          {error}
        </div>
      )}

      {tab === 'SETTINGS' && (
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-slate-200 rounded-lg p-6 space-y-5 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Company Name</label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md font-semibold"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Tagline / Subtitle</label>
              <input
                type="text"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Phone Numbers</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">Office Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Currency Code</label>
              <input
                type="text"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Financial Year Start</label>
              <input
                type="date"
                value={form.financialYearStart}
                onChange={(e) => setForm({ ...form, financialYearStart: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Financial Year End</label>
              <input
                type="date"
                value={form.financialYearEnd}
                onChange={(e) => setForm({ ...form, financialYearEnd: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Default Installments (Months)
              </label>
              <input
                type="number"
                value={form.defaultInstallmentMonths}
                onChange={(e) => setForm({ ...form, defaultInstallmentMonths: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Invoice Prefix</label>
              <input
                type="text"
                value={form.invoicePrefix}
                onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                CRV / CPV / JV Prefixes
              </label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={form.crvPrefix}
                  onChange={(e) => setForm({ ...form, crvPrefix: e.target.value })}
                  className="px-2 py-2 font-mono border border-slate-200 rounded-md"
                />
                <input
                  type="text"
                  value={form.cpvPrefix}
                  onChange={(e) => setForm({ ...form, cpvPrefix: e.target.value })}
                  className="px-2 py-2 font-mono border border-slate-200 rounded-md"
                />
                <input
                  type="text"
                  value={form.jvPrefix}
                  onChange={(e) => setForm({ ...form, jvPrefix: e.target.value })}
                  className="px-2 py-2 font-mono border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Late Payment Surcharge (%) / Grace Days
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={form.lateFeePercent}
                  onChange={(e) => setForm({ ...form, lateFeePercent: e.target.value })}
                  className="px-3 py-2 font-mono border border-slate-200 rounded-md"
                />
                <input
                  type="number"
                  value={form.gracePeriodDays}
                  onChange={(e) => setForm({ ...form, gracePeriodDays: e.target.value })}
                  className="px-3 py-2 font-mono border border-slate-200 rounded-md"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block font-medium text-slate-700 mb-1">
                Receipt Terms & Conditions
              </label>
              <input
                type="text"
                value={form.receiptTerms}
                onChange={(e) => setForm({ ...form, receiptTerms: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Document Print Footer</label>
              <input
                type="text"
                value={form.printFooter}
                onChange={(e) => setForm({ ...form, printFooter: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Company Settings'}
            </button>
          </div>
        </form>
      )}

      {tab === 'USERS' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                <th className="py-3 px-4">User Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersList.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{u.fullName}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-600">{u.email}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        handleRoleChange(u.id, e.target.value as UserRole, u.isActive)
                      }
                      className="px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                    >
                      <option value="admin">Admin (Full Access)</option>
                      <option value="accounts">Accounts User</option>
                      <option value="sales">Sales User</option>
                      <option value="recovery">Recovery User</option>
                      <option value="viewer">Viewer (Read-Only)</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <button
                      onClick={() => handleRoleChange(u.id, u.role, !u.isActive)}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                        u.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Suspended'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'AUDIT' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Entity</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-GB')}
                    </td>
                    <td className="py-2 px-4 font-mono text-slate-700">
                      {log.userEmail || 'system'}
                    </td>
                    <td className="py-2 px-4 font-semibold text-slate-900">{log.action}</td>
                    <td className="py-2 px-4 font-mono text-slate-600">
                      {log.entityType} #{log.entityId}
                    </td>
                    <td className="py-2 px-4 text-slate-600">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'BACKUP' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Export Full Database Backup</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Downloads a complete, transaction-consistent JSON snapshot of all properties,
              customers, sales, installment schedules, vouchers, ledger entries, chart of accounts,
              and company settings.
            </p>
            <button
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Database Backup (.json)
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Restore Database Snapshot</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Restores all ERP tables inside an atomic PostgreSQL transaction from a previously
              exported HAMA NAGAR backup file.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md cursor-pointer">
              <Upload className="w-4 h-4" />
              Select Backup File to Restore
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
