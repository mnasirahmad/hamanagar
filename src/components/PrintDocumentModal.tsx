import React from 'react';
import { Printer, X } from 'lucide-react';
import { CompanySettings } from '../context/AuthContext';

interface PrintDocumentModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  documentNumber?: string;
  documentDate?: string;
  settings: CompanySettings | null;
  children: React.ReactNode;
}

export function PrintDocumentModal({
  open,
  onClose,
  title,
  documentNumber,
  documentDate,
  settings,
  children,
}: PrintDocumentModalProps) {
  if (!open) return null;

  const companyName = settings?.companyName || 'HAMA NAGAR';
  const subtitle =
    settings?.subtitle || 'Housing Society – Plot & Shop Sales Management';
  const address = settings?.address || '';
  const phone = settings?.phone || '';
  const footer = settings?.printFooter || 'Powered by: Prime Soft Vehari';
  const terms = settings?.receiptTerms || '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-6 print:static print:bg-white print:p-0">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden print-container">
        {/* Non-print toolbar */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-b border-slate-200 no-print">
          <span className="text-sm font-semibold text-slate-800">{title}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Document
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-200/60 transition-colors cursor-pointer"
              aria-label="Close print preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="p-8 bg-white text-slate-900 space-y-6">
          {/* Official Letterhead */}
          <div className="border-b-2 border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              {settings?.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt={companyName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 object-contain border border-slate-200 rounded p-1"
                />
              ) : null}
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 font-display">
                  {companyName}
                </h1>
                <p className="text-sm font-medium text-slate-700">{subtitle}</p>
                {(address || phone) && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {address} {phone ? `· Tel: ${phone}` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
              <div className="text-base font-bold uppercase tracking-wide text-teal-800">
                {title}
              </div>
              {documentNumber && (
                <div className="text-xs font-mono text-slate-700 mt-1">
                  Ref No: <span className="font-semibold">{documentNumber}</span>
                </div>
              )}
              {documentDate && (
                <div className="text-xs font-mono text-slate-600">
                  Date: {documentDate}
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Document Body */}
          <div>{children}</div>

          {/* Terms & Signatures */}
          <div className="pt-6 border-t border-slate-200 space-y-8">
            {terms && (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
                <span className="font-semibold text-slate-800">Terms & Conditions: </span>
                {terms}
              </div>
            )}
            <div className="grid grid-cols-3 gap-8 pt-6 text-center text-xs text-slate-700">
              <div>
                <div className="border-t border-slate-400 pt-1.5 font-medium">Prepared By</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1.5 font-medium">Checked / Accounts</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1.5 font-medium">
                  Authorized Signature
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">{footer}</span>
              <span className="font-mono">
                Printed on {new Date().toLocaleDateString('en-GB')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
