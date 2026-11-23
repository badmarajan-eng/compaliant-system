import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import type { ComplaintRecord } from '../types/qms';
import {
  analyzeComplaintsCsv,
  downloadSampleCsvTemplate,
  type CsvAnalysisResult,
} from '../utils/csvUtils';

interface CsvImportModalProps {
  isOpen: boolean;
  existingComplaints: ComplaintRecord[];
  onClose: () => void;
  onConfirmImport: (records: ComplaintRecord[]) => void;
}

export function CsvImportModal({
  isOpen,
  existingComplaints,
  onClose,
  onConfirmImport,
}: CsvImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CsvAnalysisResult | null>(null);
  const [committedSummary, setCommittedSummary] = useState<{
    importedCount: number;
    failedCount: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const processFile = (file: File) => {
    setFileName(file.name);
    setCommittedSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const result = analyzeComplaintsCsv(text, existingComplaints);
      setAnalysis(result);
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleCommit = () => {
    if (!analysis || analysis.validRecords.length === 0) return;
    onConfirmImport(analysis.validRecords);
    setCommittedSummary({
      importedCount: analysis.validRecords.length,
      failedCount: analysis.invalidCount + analysis.duplicateCount,
    });
  };

  const handleResetAndClose = () => {
    setFileName(null);
    setAnalysis(null);
    setCommittedSummary(null);
    onClose();
  };

  const failureTotal = analysis ? analysis.invalidCount + analysis.duplicateCount : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-import-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-lg flex items-center justify-between">
          <div>
            <h2 id="csv-import-title" className="text-base font-semibold text-slate-900">
              Import Historical &amp; Customer Complaints (CSV)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Validates required columns, previews parsed rows, detects invalid records, and blocks duplicate Complaint IDs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/70"
            aria-label="Close CSV import modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          {/* Upload Dropzone & Sample Download */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Required columns: <strong className="text-slate-900">Customer Name</strong>,{' '}
              <strong className="text-slate-900">Product Name</strong>,{' '}
              <strong className="text-slate-900">Description</strong>. Optional: Complaint ID, Batch Number, Category, Severity, Dates, Process &amp; Test Results.
            </div>
            <button
              type="button"
              onClick={downloadSampleCsvTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-md hover:bg-cyan-100 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sample CSV Template</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-cyan-600 bg-cyan-50/70'
                : 'border-slate-300 hover:border-cyan-600 hover:bg-slate-50'
            }`}
          >
            <Upload className="w-6 h-6 text-cyan-700 mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-900 mt-2">
              {fileName ? `Selected file: ${fileName}` : 'Click to choose a CSV file or drag and drop'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports standard UTF-8 comma-separated (.csv) complaint logs
            </p>
          </div>

          {/* Committed Import Result Banner */}
          {committedSummary && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold text-sm">CSV Import Complete</p>
                <p className="mt-1 font-mono tabular-nums">
                  Imported Successfully: <strong>{committedSummary.importedCount}</strong> record(s) · Skipped / Failed: <strong>{committedSummary.failedCount}</strong> record(s)
                </p>
                <p className="mt-1 text-emerald-800">
                  Dashboard KPIs, charts, risk scores, and LocalStorage persistence have been updated automatically.
                </p>
              </div>
            </div>
          )}

          {/* Analysis Summary & Preview */}
          {analysis && !committedSummary && (
            <div className="space-y-4">
              {analysis.fatalError ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Column Validation Failed</p>
                    <p className="mt-1">{analysis.fatalError}</p>
                    {analysis.headersDetected.length > 0 && (
                      <p className="mt-1 font-mono text-[11px] text-red-700">
                        Detected headers: {analysis.headersDetected.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Counts Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <p className="text-slate-500">Rows Parsed</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {analysis.totalRows}
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                      <p className="text-emerald-800">Valid (Ready)</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-emerald-800 mt-0.5">
                        {analysis.validRecords.length}
                      </p>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-800">Invalid Rows</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-red-800 mt-0.5">
                        {analysis.invalidCount}
                      </p>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <p className="text-amber-800">Duplicate IDs Blocked</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-amber-800 mt-0.5">
                        {analysis.duplicateCount}
                      </p>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
                        <span>Import Preview</span>
                      </span>
                      <span className="text-slate-500 font-mono tabular-nums">
                        Showing {analysis.previewRows.length} row(s)
                      </span>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 sticky top-0">
                            <th className="py-2 px-3 font-medium">Row</th>
                            <th className="py-2 px-3 font-medium">ID</th>
                            <th className="py-2 px-3 font-medium">Customer</th>
                            <th className="py-2 px-3 font-medium">Product</th>
                            <th className="py-2 px-3 font-medium">Category / Severity</th>
                            <th className="py-2 px-3 font-medium">Validation Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {analysis.previewRows.map((row) => (
                            <tr
                              key={row.rowNumber}
                              className={
                                row.status === 'valid' ? 'bg-white' : 'bg-red-50/40'
                              }
                            >
                              <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                                #{row.rowNumber}
                              </td>
                              <td className="py-2 px-3 font-mono font-medium text-slate-900">
                                {row.assignedId}
                              </td>
                              <td className="py-2 px-3 text-slate-900">{row.customerName}</td>
                              <td className="py-2 px-3 text-slate-800">{row.productName}</td>
                              <td className="py-2 px-3 text-slate-600">
                                {row.category} · {row.severity}
                              </td>
                              <td className="py-2 px-3">
                                {row.status === 'valid' ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>Valid</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-start gap-1 text-red-700">
                                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                                    <span>{row.errors.join('; ')}</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {analysis && !analysis.fatalError && !committedSummary
              ? `${analysis.validRecords.length} valid record(s) will be imported; ${failureTotal} invalid/duplicate row(s) will be skipped.`
              : 'Upload a CSV file to validate and preview records before importing.'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetAndClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              {committedSummary ? 'Done' : 'Cancel'}
            </button>
            {!committedSummary && (
              <button
                type="button"
                disabled={!analysis || analysis.validRecords.length === 0}
                onClick={handleCommit}
                className="px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 disabled:opacity-50"
              >
                Import {analysis?.validRecords.length ?? 0} Valid Record(s)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
