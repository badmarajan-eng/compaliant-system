import type {
  ComplaintCategory,
  ComplaintRecord,
  ComplaintStatus,
  SeverityLevel,
} from '../types/qms';
import { ALL_CATEGORIES, ALL_SEVERITIES } from './qmsAnalytics';

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsvFile(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportComplaintsToCsv(
  complaints: ComplaintRecord[],
  filename = 'q-intelligence-complaints.csv'
) {
  const headers = [
    'Complaint ID',
    'Customer Name',
    'Product Name',
    'Product ID',
    'Batch Number',
    'Manufacturing Date',
    'Complaint Date',
    'Category',
    'Severity',
    'Status',
    'Resolution Date',
    'Process Name',
    'Process Parameters',
    'Test Results',
    'Description',
    'Record Origin',
  ];

  const rows = complaints.map((c) => [
    c.id,
    c.customerName,
    c.productName,
    c.productId,
    c.batchNumber,
    c.manufacturingDate,
    c.complaintDate,
    c.category,
    c.severity,
    c.status,
    c.resolutionDate ?? '',
    c.processName,
    c.processParameters,
    c.testResults,
    c.description,
    c.isDemoData ? 'DEMO DATA' : 'LIVE RECORD',
  ]);

  downloadCsvFile(filename, headers, rows);
}

export function downloadSampleCsvTemplate() {
  const headers = [
    'Complaint ID',
    'Customer Name',
    'Product Name',
    'Product ID',
    'Batch Number',
    'Manufacturing Date',
    'Complaint Date',
    'Category',
    'Severity',
    'Status',
    'Process Name',
    'Process Parameters',
    'Test Results',
    'Description',
  ];

  const sampleRows = [
    [
      'CMP-2026-901',
      'Apex Heavy Machinery',
      'Precision Drive Shaft PS-400',
      'PRD-104',
      'BCH-2611-X',
      '2026-11-02',
      '2026-11-16',
      'Dimensional Defects',
      'Critical',
      'Open',
      'CNC Cylindrical Grinding',
      'Wheel Speed: 1980 RPM | Feed: 0.08 mm/rev',
      'CMM Runout: 0.038 mm (Spec <= 0.015 mm)',
      'Bearing journal diameter exceeded upper tolerance on 8 shafts.',
    ],
    [
      'CMP-2026-902',
      'Nordic Turbine Works',
      'High-Load Tapered Bearing TB-620',
      'PRD-312',
      'BCH-2611-Y',
      '2026-11-04',
      '2026-11-18',
      'Performance Issues',
      'High',
      'Under Investigation',
      'Precision Bearing Assembly',
      'Axial Preload: 1.85 kN | Grease: 36 g',
      'Rig Temp: 109 C after 40 min run-in',
      'Bearing overheating during customer acceptance rig test.',
    ],
  ];

  downloadCsvFile('q-intelligence-import-template.csv', headers, sampleRows);
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some((cell) => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function generateNextComplaintId(existing: ComplaintRecord[]): string {
  const year = new Date().getFullYear();
  const existingSet = new Set(existing.map((c) => c.id.toUpperCase()));
  let maxNum = 0;
  for (const c of existing) {
    const match = c.id.match(/(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  let nextNum = maxNum + 1;
  let candidate = `CMP-${year}-${String(nextNum).padStart(4, '0')}`;
  while (existingSet.has(candidate.toUpperCase())) {
    nextNum++;
    candidate = `CMP-${year}-${String(nextNum).padStart(4, '0')}`;
  }
  return candidate;
}

export interface CsvPreviewRow {
  rowNumber: number;
  rawId: string;
  assignedId: string;
  customerName: string;
  productName: string;
  category: string;
  severity: string;
  complaintDate: string;
  status: 'valid' | 'invalid' | 'duplicate';
  errors: string[];
  record?: ComplaintRecord;
}

export interface CsvAnalysisResult {
  totalRows: number;
  validRecords: ComplaintRecord[];
  invalidCount: number;
  duplicateCount: number;
  previewRows: CsvPreviewRow[];
  missingRequiredColumns: string[];
  headersDetected: string[];
  fatalError?: string;
}

function isValidIsoDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const d = new Date(val);
  return !Number.isNaN(d.getTime());
}

export function analyzeComplaintsCsv(
  csvText: string,
  existingComplaints: ComplaintRecord[]
): CsvAnalysisResult {
  const rows = parseCsvLines(csvText);
  if (rows.length < 2) {
    return {
      totalRows: 0,
      validRecords: [],
      invalidCount: 0,
      duplicateCount: 0,
      previewRows: [],
      missingRequiredColumns: [],
      headersDetected: rows[0] ?? [],
      fatalError: 'CSV file must contain a header row and at least one data row.',
    };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const colIndex = (candidates: string[]) =>
    headers.findIndex((h) => candidates.some((cand) => h.includes(cand)));

  const idxId = colIndex(['complaintid', 'id']);
  const idxCustomer = colIndex(['customer']);
  const idxProduct = colIndex(['productname', 'product']);
  const idxProductId = colIndex(['productid', 'sku', 'partid']);
  const idxBatch = colIndex(['batch']);
  const idxMfgDate = colIndex(['manufacturingdate', 'mfgdate']);
  const idxCompDate = colIndex(['complaintdate', 'date']);
  const idxCategory = colIndex(['category']);
  const idxSeverity = colIndex(['severity']);
  const idxStatus = colIndex(['status']);
  const idxResDate = colIndex(['resolutiondate']);
  const idxProcess = colIndex(['processname', 'process']);
  const idxParams = colIndex(['parameter']);
  const idxTest = colIndex(['testresult', 'inspection']);
  const idxDesc = colIndex(['description', 'summary', 'issue']);

  const missingRequiredColumns: string[] = [];
  if (idxCustomer === -1) missingRequiredColumns.push('Customer Name');
  if (idxProduct === -1) missingRequiredColumns.push('Product Name');
  if (idxDesc === -1) missingRequiredColumns.push('Description');

  if (missingRequiredColumns.length > 0) {
    return {
      totalRows: rows.length - 1,
      validRecords: [],
      invalidCount: rows.length - 1,
      duplicateCount: 0,
      previewRows: [],
      missingRequiredColumns,
      headersDetected: rawHeaders,
      fatalError: `Missing required CSV column(s): ${missingRequiredColumns.join(', ')}.`,
    };
  }

  const existingIds = new Set(existingComplaints.map((c) => c.id.trim().toUpperCase()));
  const seenImportIds = new Set<string>();
  const validRecords: ComplaintRecord[] = [];
  const previewRows: CsvPreviewRow[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  const todayIso = new Date().toISOString().slice(0, 10);
  const validStatuses: ComplaintStatus[] = [
    'New',
    'Under Investigation',
    'Root Cause Identified',
    'Corrective Action In Progress',
    'Verification Pending',
    'Closed',
  ];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowErrors: string[] = [];
    const rawId = idxId >= 0 ? (row[idxId] ?? '').trim() : '';
    const customerName = (row[idxCustomer] ?? '').trim();
    const productName = (row[idxProduct] ?? '').trim();
    const description = (row[idxDesc] ?? '').trim();
    const rawCategory = idxCategory >= 0 ? (row[idxCategory] ?? '').trim() : '';
    const rawSeverity = idxSeverity >= 0 ? (row[idxSeverity] ?? '').trim() : '';
    const rawCompDate = idxCompDate >= 0 ? (row[idxCompDate] ?? '').trim() : '';
    const rawMfgDate = idxMfgDate >= 0 ? (row[idxMfgDate] ?? '').trim() : '';
    const rawStatus = idxStatus >= 0 ? (row[idxStatus] ?? '').trim() : '';

    if (!customerName) rowErrors.push('Missing Customer Name');
    if (!productName) rowErrors.push('Missing Product Name');
    if (!description || description.length < 5) {
      rowErrors.push('Description missing or too short');
    }

    if (rawCompDate && !isValidIsoDate(rawCompDate)) {
      rowErrors.push(`Invalid Complaint Date "${rawCompDate}" (expected YYYY-MM-DD)`);
    }
    if (rawMfgDate && !isValidIsoDate(rawMfgDate)) {
      rowErrors.push(`Invalid Manufacturing Date "${rawMfgDate}" (expected YYYY-MM-DD)`);
    }
    if (rawCategory && !ALL_CATEGORIES.includes(rawCategory as ComplaintCategory)) {
      rowErrors.push(`Unknown Category "${rawCategory}"`);
    }
    if (rawSeverity && !ALL_SEVERITIES.includes(rawSeverity as SeverityLevel)) {
      rowErrors.push(`Unknown Severity "${rawSeverity}"`);
    }

    const normalizedRawId = rawId.toUpperCase();
    let isDuplicate = false;
    if (rawId) {
      if (existingIds.has(normalizedRawId)) {
        isDuplicate = true;
        rowErrors.push(`Duplicate Complaint ID "${rawId}" already exists in dataset`);
      } else if (seenImportIds.has(normalizedRawId)) {
        isDuplicate = true;
        rowErrors.push(`Duplicate Complaint ID "${rawId}" repeated inside CSV`);
      }
    }

    if (rowErrors.length > 0) {
      if (isDuplicate) duplicateCount++;
      else invalidCount++;

      previewRows.push({
        rowNumber: r + 1,
        rawId: rawId || 'Auto',
        assignedId: rawId || '—',
        customerName: customerName || '—',
        productName: productName || '—',
        category: rawCategory || 'Other',
        severity: rawSeverity || 'Medium',
        complaintDate: rawCompDate || todayIso,
        status: isDuplicate ? 'duplicate' : 'invalid',
        errors: rowErrors,
      });
      continue;
    }

    const assignedId =
      rawId || generateNextComplaintId([...existingComplaints, ...validRecords]);
    seenImportIds.add(assignedId.toUpperCase());

    const category: ComplaintCategory = ALL_CATEGORIES.includes(rawCategory as ComplaintCategory)
      ? (rawCategory as ComplaintCategory)
      : 'Other';

    const severity: SeverityLevel = ALL_SEVERITIES.includes(rawSeverity as SeverityLevel)
      ? (rawSeverity as SeverityLevel)
      : 'Medium';

    const normalizedStatusInput =
      rawStatus === 'Open'
        ? 'New'
        : rawStatus === 'CAPA In Progress'
          ? 'Corrective Action In Progress'
          : rawStatus;

    const status: ComplaintStatus = validStatuses.includes(normalizedStatusInput as ComplaintStatus)
      ? (normalizedStatusInput as ComplaintStatus)
      : 'New';

    const complaintDate = rawCompDate || todayIso;
    const manufacturingDate = rawMfgDate || complaintDate;

    const record: ComplaintRecord = {
      id: assignedId,
      customerName,
      productName,
      productId: (idxProductId >= 0 && row[idxProductId]?.trim()) || 'PRD-EXT',
      batchNumber: (idxBatch >= 0 && row[idxBatch]?.trim()) || 'BCH-IMPORT',
      manufacturingDate,
      complaintDate,
      category,
      description,
      severity,
      processName: (idxProcess >= 0 && row[idxProcess]?.trim()) || 'General Manufacturing',
      processParameters:
        (idxParams >= 0 && row[idxParams]?.trim()) || 'Not specified in CSV import',
      testResults:
        (idxTest >= 0 && row[idxTest]?.trim()) || 'Pending laboratory inspection',
      status,
      resolutionDate:
        status === 'Closed'
          ? (idxResDate >= 0 && row[idxResDate]?.trim()) || todayIso
          : undefined,
      isDemoData: false,
      capaActions: [],
    };

    validRecords.push(record);
    previewRows.push({
      rowNumber: r + 1,
      rawId: rawId || '(Auto-generated)',
      assignedId,
      customerName,
      productName,
      category,
      severity,
      complaintDate,
      status: 'valid',
      errors: [],
      record,
    });
  }

  return {
    totalRows: rows.length - 1,
    validRecords,
    invalidCount,
    duplicateCount,
    previewRows,
    missingRequiredColumns: [],
    headersDetected: rawHeaders,
  };
}
