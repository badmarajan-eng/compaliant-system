import React, { useEffect, useState } from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
import type {
  ComplaintCategory,
  ComplaintRecord,
  ComplaintStatus,
  PriorityLevel,
  SeverityLevel,
} from '../types/qms';
import {
  ALL_CATEGORIES,
  ALL_COMPLAINT_STATUSES,
  ALL_PRIORITIES,
  ALL_SEVERITIES,
} from '../utils/qmsAnalytics';

interface ComplaintRegistrationFormProps {
  initialComplaint?: ComplaintRecord | null;
  suggestedId: string;
  onCancel: () => void;
  onSave: (
    data: Omit<ComplaintRecord, 'id' | 'isDemoData' | 'capaActions'> & { id?: string }
  ) => void;
}

const SHIFTS = ['Shift A (Day)', 'Shift B (Evening)', 'Shift C (Night)'];
const MANAGERS = [
  'R. Deshmukh',
  'S. Nair',
  'M. Kulkarni',
  'A. Sharma',
  'K. Patel',
];

export function ComplaintRegistrationForm({
  initialComplaint,
  suggestedId,
  onCancel,
  onSave,
}: ComplaintRegistrationFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  // A. Complaint Information
  const [complaintDate, setComplaintDate] = useState(today);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [productName, setProductName] = useState('');
  const [productId, setProductId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [manufacturingDate, setManufacturingDate] = useState(today);

  // B. Complaint Classification
  const [category, setCategory] = useState<ComplaintCategory>('Product Quality');
  const [severity, setSeverity] = useState<SeverityLevel>('Medium');
  const [description, setDescription] = useState('');

  // C. Manufacturing Information
  const [processName, setProcessName] = useState('');
  const [machineId, setMachineId] = useState('');
  const [processParameters, setProcessParameters] = useState('');
  const [temperature, setTemperature] = useState('');
  const [pressure, setPressure] = useState('');
  const [productionShift, setProductionShift] = useState(SHIFTS[0]);
  const [operatorId, setOperatorId] = useState('');

  // D. Quality Test Information
  const [testType, setTestType] = useState('');
  const [expectedValue, setExpectedValue] = useState('');
  const [actualValue, setActualValue] = useState('');
  const [testResults, setTestResults] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');

  // E. Additional Information
  const [assignedManager, setAssignedManager] = useState(MANAGERS[0]);
  const [priority, setPriority] = useState<PriorityLevel>('Normal');
  const [status, setStatus] = useState<ComplaintStatus>('New');

  const [errors, setErrors] = useState<Record<string, string>>({});

  const populateForm = (source?: ComplaintRecord | null) => {
    setErrors({});
    if (source) {
      setComplaintDate(source.complaintDate);
      setCustomerName(source.customerName);
      setCustomerId(source.customerId ?? '');
      setContactEmail(source.contactEmail ?? '');
      setProductName(source.productName);
      setProductId(source.productId);
      setBatchNumber(source.batchNumber);
      setManufacturingDate(source.manufacturingDate);
      setCategory(source.category);
      setSeverity(source.severity);
      setDescription(source.description);
      setProcessName(source.processName);
      setMachineId(source.machineId ?? '');
      setProcessParameters(source.processParameters);
      setTemperature(source.temperature ?? '');
      setPressure(source.pressure ?? '');
      setProductionShift(source.productionShift ?? SHIFTS[0]);
      setOperatorId(source.operatorId ?? '');
      setTestType(source.testType ?? '');
      setExpectedValue(source.expectedValue ?? '');
      setActualValue(source.actualValue ?? '');
      setTestResults(source.testResults);
      setInspectionNotes(source.inspectionNotes ?? '');
      setAssignedManager(source.assignedManager ?? MANAGERS[0]);
      setPriority(source.priority ?? 'Normal');
      setStatus(source.status);
    } else {
      setComplaintDate(today);
      setCustomerName('');
      setCustomerId('');
      setContactEmail('');
      setProductName('');
      setProductId('');
      setBatchNumber('');
      setManufacturingDate(today);
      setCategory('Product Quality');
      setSeverity('Medium');
      setDescription('');
      setProcessName('');
      setMachineId('');
      setProcessParameters('');
      setTemperature('');
      setPressure('');
      setProductionShift(SHIFTS[0]);
      setOperatorId('');
      setTestType('');
      setExpectedValue('');
      setActualValue('');
      setTestResults('');
      setInspectionNotes('');
      setAssignedManager(MANAGERS[0]);
      setPriority('Normal');
      setStatus('New');
    }
  };

  useEffect(() => {
    populateForm(initialComplaint);
  }, [initialComplaint]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!complaintDate) next.complaintDate = 'Complaint date is required.';
    if (!customerName.trim()) next.customerName = 'Customer name is required.';
    if (!customerId.trim()) next.customerId = 'Customer ID is required.';
    if (!contactEmail.trim()) {
      next.contactEmail = 'Contact email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      next.contactEmail = 'Enter a valid email address.';
    }
    if (!productName.trim()) next.productName = 'Product name is required.';
    if (!productId.trim()) next.productId = 'Product ID is required.';
    if (!batchNumber.trim()) next.batchNumber = 'Batch number is required.';
    if (!manufacturingDate) next.manufacturingDate = 'Manufacturing date is required.';
    if (manufacturingDate && complaintDate && complaintDate < manufacturingDate) {
      next.complaintDate = 'Complaint date cannot be earlier than manufacturing date.';
    }
    if (description.trim().length < 10) {
      next.description = 'Complaint description must be at least 10 characters.';
    }
    if (!processName.trim()) next.processName = 'Manufacturing process is required.';
    if (!machineId.trim()) next.machineId = 'Machine ID is required.';
    if (!processParameters.trim()) next.processParameters = 'Process parameters are required.';
    if (!testType.trim()) next.testType = 'Test type is required.';
    if (!expectedValue.trim()) next.expectedValue = 'Expected specification value is required.';
    if (!actualValue.trim()) next.actualValue = 'Actual measured value is required.';
    if (!testResults.trim()) next.testResults = 'Test result summary is required.';
    if (!assignedManager.trim()) next.assignedManager = 'Assigned Quality Manager is required.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    onSave({
      id: initialComplaint?.id ?? suggestedId,
      complaintDate,
      customerName: customerName.trim(),
      customerId: customerId.trim(),
      contactEmail: contactEmail.trim(),
      productName: productName.trim(),
      productId: productId.trim(),
      batchNumber: batchNumber.trim(),
      manufacturingDate,
      category,
      severity,
      description: description.trim(),
      processName: processName.trim(),
      machineId: machineId.trim(),
      processParameters: processParameters.trim(),
      temperature: temperature.trim() || undefined,
      pressure: pressure.trim() || undefined,
      productionShift,
      operatorId: operatorId.trim() || undefined,
      testType: testType.trim(),
      expectedValue: expectedValue.trim(),
      actualValue: actualValue.trim(),
      testResults: testResults.trim(),
      inspectionNotes: inspectionNotes.trim() || undefined,
      assignedManager: assignedManager.trim(),
      priority,
      status,
      resolutionDate:
        status === 'Closed'
          ? initialComplaint?.resolutionDate ?? new Date().toISOString().slice(0, 10)
          : undefined,
    });
  };

  const inputCls = (key: string) =>
    `w-full px-3 py-2 text-xs bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-600/30 ${
      errors[key] ? 'border-red-500' : 'border-slate-300 focus:border-cyan-700'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {Object.keys(errors).length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
          Please correct the {Object.keys(errors).length} highlighted validation error(s) below before saving.
        </div>
      )}

      {/* A. Complaint Information */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
          A. Complaint &amp; Product Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Complaint ID (Auto-Generated)
            </label>
            <input
              type="text"
              readOnly
              value={initialComplaint?.id ?? suggestedId}
              className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-300 rounded-md font-mono font-semibold text-cyan-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Complaint Date *
            </label>
            <input
              type="date"
              value={complaintDate}
              onChange={(e) => setComplaintDate(e.target.value)}
              className={`${inputCls('complaintDate')} tabular-nums`}
            />
            {errors.complaintDate && (
              <p className="text-[11px] text-red-600 mt-1">{errors.complaintDate}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Customer Name *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g., Apex Heavy Machinery"
              className={inputCls('customerName')}
            />
            {errors.customerName && (
              <p className="text-[11px] text-red-600 mt-1">{errors.customerName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Customer ID *
            </label>
            <input
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="e.g., CUST-104"
              className={`${inputCls('customerId')} font-mono`}
            />
            {errors.customerId && (
              <p className="text-[11px] text-red-600 mt-1">{errors.customerId}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Contact Email *
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="e.g., quality@apexmachinery.com"
              className={inputCls('contactEmail')}
            />
            {errors.contactEmail && (
              <p className="text-[11px] text-red-600 mt-1">{errors.contactEmail}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Product Name *
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., Precision Drive Shaft PS-400"
              className={inputCls('productName')}
            />
            {errors.productName && (
              <p className="text-[11px] text-red-600 mt-1">{errors.productName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Product ID *
            </label>
            <input
              type="text"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="e.g., PRD-104"
              className={`${inputCls('productId')} font-mono`}
            />
            {errors.productId && (
              <p className="text-[11px] text-red-600 mt-1">{errors.productId}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Batch Number *
            </label>
            <input
              type="text"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g., BCH-2611-C"
              className={`${inputCls('batchNumber')} font-mono`}
            />
            {errors.batchNumber && (
              <p className="text-[11px] text-red-600 mt-1">{errors.batchNumber}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Manufacturing Date *
            </label>
            <input
              type="date"
              value={manufacturingDate}
              onChange={(e) => setManufacturingDate(e.target.value)}
              className={`${inputCls('manufacturingDate')} tabular-nums`}
            />
            {errors.manufacturingDate && (
              <p className="text-[11px] text-red-600 mt-1">{errors.manufacturingDate}</p>
            )}
          </div>
        </div>
      </section>

      {/* B. Complaint Classification */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
          B. Complaint Classification
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Complaint Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
              className={inputCls('category')}
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Severity Level *
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
              className={inputCls('severity')}
            >
              {ALL_SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Complaint Description *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe observed defect, affected quantity, customer line impact, and failure symptoms..."
              className={inputCls('description')}
            />
            {errors.description && (
              <p className="text-[11px] text-red-600 mt-1">{errors.description}</p>
            )}
          </div>
        </div>
      </section>

      {/* C. Manufacturing Information */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
          C. Manufacturing Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Manufacturing Process *
            </label>
            <input
              type="text"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              placeholder="e.g., CNC Cylindrical Grinding"
              className={inputCls('processName')}
            />
            {errors.processName && (
              <p className="text-[11px] text-red-600 mt-1">{errors.processName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Machine ID *
            </label>
            <input
              type="text"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              placeholder="e.g., CNC-G04"
              className={`${inputCls('machineId')} font-mono`}
            />
            {errors.machineId && (
              <p className="text-[11px] text-red-600 mt-1">{errors.machineId}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Production Shift
            </label>
            <select
              value={productionShift}
              onChange={(e) => setProductionShift(e.target.value)}
              className={inputCls('productionShift')}
            >
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Temperature
            </label>
            <input
              type="text"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="e.g., 24 °C (Coolant)"
              className={inputCls('temperature')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Pressure
            </label>
            <input
              type="text"
              value={pressure}
              onChange={(e) => setPressure(e.target.value)}
              placeholder="e.g., 6.2 bar"
              className={inputCls('pressure')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Operator ID
            </label>
            <input
              type="text"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              placeholder="e.g., OP-214"
              className={`${inputCls('operatorId')} font-mono`}
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Process Parameters *
            </label>
            <input
              type="text"
              value={processParameters}
              onChange={(e) => setProcessParameters(e.target.value)}
              placeholder="e.g., Wheel Speed: 1950 RPM | Feed: 0.08 mm/rev | Coolant Flow: 18 L/min"
              className={inputCls('processParameters')}
            />
            {errors.processParameters && (
              <p className="text-[11px] text-red-600 mt-1">{errors.processParameters}</p>
            )}
          </div>
        </div>
      </section>

      {/* D. Quality Test Information */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
          D. Quality Test Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Test Type *
            </label>
            <input
              type="text"
              value={testType}
              onChange={(e) => setTestType(e.target.value)}
              placeholder="e.g., CMM Runout & OD Micrometer"
              className={inputCls('testType')}
            />
            {errors.testType && (
              <p className="text-[11px] text-red-600 mt-1">{errors.testType}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Expected Value *
            </label>
            <input
              type="text"
              value={expectedValue}
              onChange={(e) => setExpectedValue(e.target.value)}
              placeholder="e.g., 42.000 ± 0.015 mm"
              className={`${inputCls('expectedValue')} font-mono`}
            />
            {errors.expectedValue && (
              <p className="text-[11px] text-red-600 mt-1">{errors.expectedValue}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Actual Value *
            </label>
            <input
              type="text"
              value={actualValue}
              onChange={(e) => setActualValue(e.target.value)}
              placeholder="e.g., 42.065 mm"
              className={`${inputCls('actualValue')} font-mono`}
            />
            {errors.actualValue && (
              <p className="text-[11px] text-red-600 mt-1">{errors.actualValue}</p>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Test Result Summary *
            </label>
            <input
              type="text"
              value={testResults}
              onChange={(e) => setTestResults(e.target.value)}
              placeholder="e.g., FAIL — CMM Runout 0.041 mm vs Spec <= 0.015 mm"
              className={inputCls('testResults')}
            />
            {errors.testResults && (
              <p className="text-[11px] text-red-600 mt-1">{errors.testResults}</p>
            )}
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Quality Inspection Notes
            </label>
            <textarea
              rows={2}
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              placeholder="Additional inspector observations, quarantine lot scope, or gauge calibration status..."
              className={inputCls('inspectionNotes')}
            />
          </div>
        </div>
      </section>

      {/* E. Additional Information */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
          E. Assignment &amp; Workflow Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Assigned Quality Manager *
            </label>
            <select
              value={assignedManager}
              onChange={(e) => setAssignedManager(e.target.value)}
              className={inputCls('assignedManager')}
            >
              {MANAGERS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {errors.assignedManager && (
              <p className="text-[11px] text-red-600 mt-1">{errors.assignedManager}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityLevel)}
              className={inputCls('priority')}
            >
              {ALL_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Complaint Status *
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
              className={inputCls('status')}
            >
              {ALL_COMPLAINT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={() => populateForm(initialComplaint)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset Form</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cancel</span>
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 transition-colors"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{initialComplaint ? 'Update Complaint' : 'Save Complaint'}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
