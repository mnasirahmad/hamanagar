import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanySettings } from '../context/AuthContext';

export function formatPKR(value: number | string | null | undefined, currency = 'PKR'): string {
  const num = Number(value || 0);
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isNaN(num) ? 0 : num);
  return `${currency} ${formatted}`;
}

export function formatNum(value: number | string | null | undefined): string {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function exportToExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, any>[]
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPDF(options: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  filename: string;
  settings?: CompanySettings | null;
  orientation?: 'portrait' | 'landscape';
  totalsRow?: (string | number)[];
}) {
  const doc = new jsPDF({
    orientation: options.orientation || 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const companyName = options.settings?.companyName || 'HAMA NAGAR';
  const companySub =
    options.settings?.subtitle || 'Housing Society – Plot & Shop Sales Management';
  const address = options.settings?.address || '';
  const phone = options.settings?.phone || '';
  const footerText = options.settings?.printFooter || 'Powered by: Prime Soft Vehari';

  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(companyName, pageWidth / 2, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(companySub, pageWidth / 2, 19.5, { align: 'center' });

  if (address || phone) {
    doc.setFontSize(8.5);
    doc.text(`${address}${phone ? ` · Tel: ${phone}` : ''}`, pageWidth / 2, 24, {
      align: 'center',
    });
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(14, 27, pageWidth - 14, 27);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(options.title, 14, 34);

  if (options.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(options.subtitle, 14, 39);
  }

  const bodyRows = [...options.rows];
  if (options.totalsRow) {
    bodyRows.push(options.totalsRow);
  }

  autoTable(doc, {
    startY: options.subtitle ? 43 : 38,
    head: [options.headers],
    body: bodyRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    didParseCell: (data) => {
      if (options.totalsRow && data.row.index === bodyRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [248, 250, 252];
      }
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(footerText, 14, pageHeight - 8);
      doc.text(
        `Printed: ${new Date().toLocaleDateString('en-GB')} · Page ${doc.getNumberOfPages()}`,
        pageWidth - 14,
        pageHeight - 8,
        { align: 'right' }
      );
    },
  });

  doc.save(`${options.filename}.pdf`);
}
