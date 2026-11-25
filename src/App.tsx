import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building,
  Users,
  FileCheck2,
  CalendarRange,
  ReceiptText,
  BookOpen,
  Scale,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Lock,
} from 'lucide-react';
import { AuthProvider, useAuth, UserRole } from './context/AuthContext';
import { DashboardPage } from './pages/DashboardPage';
import { PropertiesPage } from './pages/PropertiesPage';
import { CustomersPage } from './pages/CustomersPage';
import { SalesPage } from './pages/SalesPage';
import { InstallmentsPage } from './pages/InstallmentsPage';
import { VouchersPage } from './pages/VouchersPage';
import { ChartOfAccountsPage } from './pages/ChartOfAccountsPage';
import { LedgersPage } from './pages/LedgersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsAndAdminPage } from './pages/SettingsAndAdminPage';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'accounts', 'sales', 'recovery', 'viewer'],
  },
  {
    id: 'properties',
    label: 'Properties & Plots',
    icon: Building,
    roles: ['admin', 'accounts', 'sales', 'recovery', 'viewer'],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    roles: ['admin', 'accounts', 'sales', 'recovery', 'viewer'],
  },
  {
    id: 'sales',
    label: 'Property Sales',
    icon: FileCheck2,
    roles: ['admin', 'accounts', 'sales', 'recovery', 'viewer'],
  },
  {
    id: 'installments',
    label: 'Installments',
    icon: CalendarRange,
    roles: ['admin', 'accounts', 'sales', 'recovery', 'viewer'],
  },
  {
    id: 'vouchers',
    label: 'Vouchers (CRV/CPV/JV)',
    icon: ReceiptText,
    roles: ['admin', 'accounts', 'recovery', 'viewer'],
  },
  {
    id: 'coa',
    label: 'Chart of Accounts',
    icon: BookOpen,
    roles: ['admin', 'accounts', 'viewer'],
  },
  {
    id: 'ledgers',
    label: 'Ledgers & Statements',
    icon: Scale,
    roles: ['admin', 'accounts', 'recovery', 'viewer'],
  },
  {
    id: 'reports',
    label: 'Management Reports',
    icon: BarChart3,
    roles: ['admin', 'accounts', 'sales', 'recovery', 'viewer'],
  },
  {
    id: 'settings',
    label: 'Settings & Admin',
    icon: Settings,
    roles: ['admin'],
  },
];

function ErpShell() {
  const { firebaseUser, erpUser, settings, loading, authError, signInWithGoogle, signOut } =
    useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-lg font-bold text-slate-900 font-display">HAMA NAGAR</div>
          <div className="text-xs text-slate-500">Initializing ERP Workspace...</div>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !erpUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-between p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8 space-y-6">
            <div className="space-y-1.5 border-b border-slate-200 pb-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                Housing Society Management & Accounting ERP
              </div>
              <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
                HAMA NAGAR
              </h1>
              <p className="text-xs text-slate-500">
                Plot & Shop Inventory · Installment Recovery · Double-Entry General Ledger
              </p>
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded text-xs">
                {authError}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={signInWithGoogle}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                Sign In with Google Account
              </button>
              <p className="text-[11px] text-slate-500 text-center">
                Role-based security enforced for Admin, Accounts, Sales, Recovery, and Viewer users.
              </p>
            </div>
          </div>
        </div>
        <footer className="text-center text-xs text-slate-500 py-3">
          Powered by: <span className="font-semibold text-slate-700">Prime Soft Vehari</span>
        </footer>
      </div>
    );
  }

  const allowedNav = NAV_ITEMS.filter((item) =>
    item.roles.includes((erpUser.role || 'viewer') as UserRole)
  );
  const currentNav = allowedNav.find((n) => n.id === activeTab) || allowedNav[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden no-print"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-base font-bold tracking-tight text-white font-display">
                {settings?.companyName || 'HAMA NAGAR'}
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                Housing Society ERP
              </div>
            </div>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {allowedNav.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-md transition-colors cursor-pointer text-left ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-800 space-y-3">
            <div className="text-xs">
              <div className="font-semibold text-white truncate">{erpUser.fullName}</div>
              <div className="text-[11px] text-slate-400 truncate">{erpUser.email}</div>
              <div className="text-[11px] font-mono uppercase text-teal-400 mt-0.5">
                Role: {erpUser.role}
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                {settings?.companyName || 'HAMA NAGAR'}
              </span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-700 font-medium truncate">{currentNav?.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
            <span className="hidden sm:inline font-mono">
              FY {settings?.financialYearStart?.slice(0, 4)}–{settings?.financialYearEnd?.slice(0, 4)} · {settings?.currency || 'PKR'}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && <DashboardPage onNavigate={setActiveTab} />}
          {activeTab === 'properties' && <PropertiesPage />}
          {activeTab === 'customers' && <CustomersPage />}
          {activeTab === 'sales' && <SalesPage />}
          {activeTab === 'installments' && <InstallmentsPage />}
          {activeTab === 'vouchers' && <VouchersPage />}
          {activeTab === 'coa' && <ChartOfAccountsPage />}
          {activeTab === 'ledgers' && <LedgersPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'settings' && <SettingsAndAdminPage />}
        </main>

        <footer className="bg-white border-t border-slate-200 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 no-print">
          <span>
            {settings?.companyName || 'HAMA NAGAR'} — {settings?.subtitle || 'Housing Society Management ERP'}
          </span>
          <span className="font-semibold text-slate-700">
            {settings?.printFooter || 'Powered by: Prime Soft Vehari'}
          </span>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ErpShell />
    </AuthProvider>
  );
}
