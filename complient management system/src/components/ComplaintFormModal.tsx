import { X } from 'lucide-react';
import type { ComplaintRecord } from '../types/qms';
import { ComplaintRegistrationForm } from './ComplaintRegistrationForm';

interface ComplaintFormModalProps {
  isOpen: boolean;
  initialComplaint?: ComplaintRecord | null;
  suggestedId: string;
  onClose: () => void;
  onSave: (
    data: Omit<ComplaintRecord, 'id' | 'isDemoData' | 'capaActions'> & { id?: string }
  ) => void;
}

export function ComplaintFormModal({
  isOpen,
  initialComplaint,
  suggestedId,
  onClose,
  onSave,
}: ComplaintFormModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="complaint-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
          <div>
            <h2 id="complaint-modal-title" className="text-base font-semibold text-slate-900">
              {initialComplaint
                ? `Edit Complaint ${initialComplaint.id}`
                : 'Register Customer Complaint'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              Record ID: {initialComplaint?.id ?? suggestedId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-200/70 transition-colors"
            aria-label="Close form"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <ComplaintRegistrationForm
            initialComplaint={initialComplaint}
            suggestedId={suggestedId}
            onCancel={onClose}
            onSave={(data) => {
              onSave(data);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
