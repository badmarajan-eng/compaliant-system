import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  RotateCcw,
  Save,
} from 'lucide-react';
import type { FiveWhysStep } from '../types/qms';

interface FiveWhysPanelProps {
  complaintId: string;
  productName: string;
  description: string;
  steps: FiveWhysStep[];
  onSaveSteps: (steps: FiveWhysStep[]) => void;
}

function buildStarterFiveWhys(productName: string, description: string): FiveWhysStep[] {
  return [
    {
      level: 1,
      question: `Why did ${productName} experience the reported defect?`,
      answer: `Observed symptom: ${description}`,
      origin: 'Manager Edited',
      evidenceNote: 'Initial customer/inspection symptom from complaint record.',
      validatedByManager: false,
    },
    {
      level: 2,
      question: 'Why did the manufacturing or handling output deviate from specification?',
      answer: 'Pending physical process & parameter verification.',
      origin: 'Manager Edited',
      evidenceNote: '',
      validatedByManager: false,
    },
    {
      level: 3,
      question: 'Why did that process or equipment condition occur?',
      answer: '',
      origin: 'Manager Edited',
      evidenceNote: '',
      validatedByManager: false,
    },
    {
      level: 4,
      question: 'Why was the deviation not detected prior to release?',
      answer: '',
      origin: 'Manager Edited',
      evidenceNote: '',
      validatedByManager: false,
    },
    {
      level: 5,
      question: 'Why did the control plan or systemic safeguard allow this gap?',
      answer: '',
      origin: 'Manager Edited',
      evidenceNote: '',
      validatedByManager: false,
    },
  ];
}

export function FiveWhysPanel({
  complaintId,
  productName,
  description,
  steps,
  onSaveSteps,
}: FiveWhysPanelProps) {
  const [drafts, setDrafts] = useState<FiveWhysStep[]>(() =>
    steps.length > 0 ? steps : buildStarterFiveWhys(productName, description)
  );
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    setDrafts(steps.length > 0 ? steps : buildStarterFiveWhys(productName, description));
    setSavedBanner(false);
  }, [complaintId, steps]);

  const updateStep = (index: number, patch: Partial<FiveWhysStep>) => {
    setDrafts((prev) =>
      prev.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
    setSavedBanner(false);
  };

  const toggleValidate = (index: number) => {
    const current = drafts[index];
    if (!current) return;
    const nextValidated = !current.validatedByManager;
    const nextSteps = drafts.map((s, i) =>
      i === index
        ? {
            ...s,
            validatedByManager: nextValidated,
            validatedAt: nextValidated ? new Date().toISOString() : undefined,
          }
        : s
    );
    setDrafts(nextSteps);
    onSaveSteps(nextSteps);
    setSavedBanner(true);
  };

  const handleAddLevel = () => {
    setDrafts((prev) => [
      ...prev,
      {
        level: prev.length + 1,
        question: `Why ${prev.length + 1}: Further causal drill-down`,
        answer: '',
        origin: 'Manager Edited',
        evidenceNote: '',
        validatedByManager: false,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2.5 text-xs text-amber-950">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold">
            Advisory Investigation Path — Validation Required
          </p>
          <p className="text-amber-900 mt-0.5">
            AI-generated 5 Whys chains are illustrative hypotheses, not established facts. Edit each question, answer, and evidence reference below and validate each step only after confirming physical or metrology evidence.
          </p>
        </div>
      </div>

      {savedBanner && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>5 Whys investigation steps saved to {complaintId}.</span>
        </div>
      )}

      <div className="space-y-3">
        {drafts.map((step, idx) => (
          <div
            key={step.level}
            className={`p-4 border rounded-md space-y-3 ${
              step.validatedByManager
                ? 'bg-emerald-50/40 border-emerald-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-[#0B1426]">
                  Why {step.level}
                </span>
                <span className="text-slate-300" aria-hidden="true">|</span>
                <span className="text-slate-500">{step.origin}</span>
                <span className="text-slate-300" aria-hidden="true">|</span>
                <span
                  className={
                    step.validatedByManager
                      ? 'font-semibold text-emerald-700'
                      : 'text-amber-700 font-medium'
                  }
                >
                  {step.validatedByManager ? 'Validated by Manager' : 'Pending Validation'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => toggleValidate(idx)}
                disabled={!step.answer.trim()}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                  step.validatedByManager
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {step.validatedByManager ? 'Validated' : 'Validate Step'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">
                  Question
                </label>
                <input
                  type="text"
                  value={step.question}
                  onChange={(e) =>
                    updateStep(idx, {
                      question: e.target.value,
                      origin: 'Manager Edited',
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">
                  Suspected / Observed Answer
                </label>
                <textarea
                  rows={2}
                  value={step.answer}
                  onChange={(e) =>
                    updateStep(idx, {
                      answer: e.target.value,
                      origin: 'Manager Edited',
                    })
                  }
                  placeholder="Enter suspected causal step or verified finding..."
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">
                  Supporting Evidence / Verification Reference
                </label>
                <input
                  type="text"
                  value={step.evidenceNote}
                  onChange={(e) =>
                    updateStep(idx, {
                      evidenceNote: e.target.value,
                      origin: 'Manager Edited',
                    })
                  }
                  placeholder="Cite log ID, metrology sheet, physical check, or state 'Evidence needed'..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-800"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddLevel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Why Level</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setDrafts(buildStarterFiveWhys(productName, description))
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset Template</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onSaveSteps(drafts);
            setSavedBanner(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
        >
          <Save className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Save 5 Whys Investigation</span>
        </button>
      </div>
    </div>
  );
}
