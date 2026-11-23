import { useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  FileCheck2,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  RootCauseHypothesis,
  SixMCategory,
} from '../types/qms';
import { ALL_6M_CATEGORIES, infer6MCategory } from '../utils/rcaUtils';

interface FishboneDiagramProps {
  problemStatement: string;
  complaintId: string;
  processName: string;
  hypotheses: RootCauseHypothesis[];
  readOnly?: boolean;
  onAddCause?: (category6M: SixMCategory, title: string, description: string, evidence: string) => void;
  onEditCause?: (id: string, patch: Partial<RootCauseHypothesis>) => void;
  onRemoveCause?: (id: string) => void;
  onSelectCause?: (id: string) => void;
}

const TOP_BRANCHES: SixMCategory[] = ['Machine', 'Material', 'Method'];
const BOTTOM_BRANCHES: SixMCategory[] = ['Manpower', 'Measurement', 'Environment'];

function getCauseBadgeLabel(h: RootCauseHypothesis): {
  label: string;
  boxClass: string;
  textClass: string;
} {
  if (h.managerStatus === 'Verified') {
    return {
      label: 'Verified Cause',
      boxClass: 'border-emerald-400 bg-emerald-50/70',
      textClass: 'text-emerald-800',
    };
  }
  if (h.managerStatus === 'Rejected') {
    return {
      label: 'Rejected Cause',
      boxClass: 'border-red-300 bg-red-50/50 opacity-75',
      textClass: 'text-red-700 line-through',
    };
  }
  if (h.evidenceSupported) {
    return {
      label: 'Evidence-Supported',
      boxClass: 'border-cyan-400 bg-cyan-50/60',
      textClass: 'text-cyan-900',
    };
  }
  return {
    label: h.origin === 'Manager Added' ? 'Manager Added' : 'AI-Suggested',
    boxClass: 'border-slate-300 bg-white',
    textClass: 'text-slate-700',
  };
}

export function FishboneDiagram({
  problemStatement,
  complaintId,
  processName,
  hypotheses,
  readOnly = false,
  onAddCause,
  onEditCause,
  onRemoveCause,
  onSelectCause,
}: FishboneDiagramProps) {
  const [addingBranch, setAddingBranch] = useState<SixMCategory | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newEvidence, setNewEvidence] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<SixMCategory>('Method');
  const [editEvidence, setEditEvidence] = useState('');

  const grouped = ALL_6M_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = hypotheses.filter((h) => infer6MCategory(h) === cat);
      return acc;
    },
    {} as Record<SixMCategory, RootCauseHypothesis[]>
  );

  const handleSaveNew = () => {
    if (!addingBranch || !newTitle.trim() || !onAddCause) return;
    onAddCause(
      addingBranch,
      newTitle.trim(),
      newDescription.trim() || `Added to ${addingBranch} branch for ${processName}.`,
      newEvidence.trim() || 'Manager observation during 6M investigation.'
    );
    setAddingBranch(null);
    setNewTitle('');
    setNewDescription('');
    setNewEvidence('');
  };

  const startEdit = (h: RootCauseHypothesis) => {
    setEditingId(h.id);
    setEditTitle(h.title);
    setEditCategory(infer6MCategory(h));
    setEditEvidence(h.supportingEvidence);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editTitle.trim() || !onEditCause) return;
    onEditCause(editingId, {
      title: editTitle.trim(),
      category6M: editCategory,
      supportingEvidence: editEvidence.trim(),
      evidenceSupported:
        Boolean(editEvidence.trim()) &&
        !/insufficient|none available/i.test(editEvidence),
    });
    setEditingId(null);
  };

  const renderBranchCard = (category: SixMCategory, isTop: boolean) => {
    const items = grouped[category] ?? [];
    return (
      <div
        key={category}
        className={`flex flex-col justify-between border border-slate-200 rounded-md bg-slate-50/70 p-3.5 ${
          isTop ? 'mb-2' : 'mt-2'
        }`}
      >
        <div>
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#0B1426] uppercase tracking-wider">
                {category}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                ({items.length})
              </span>
            </div>
            {!readOnly && onAddCause && (
              <button
                type="button"
                onClick={() => {
                  setAddingBranch(category);
                  setNewTitle('');
                  setNewDescription('');
                  setNewEvidence('');
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-800 hover:text-cyan-950"
              >
                <Plus className="w-3 h-3" aria-hidden="true" />
                <span>Add</span>
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-3">
              No causes mapped to {category}.
            </p>
          ) : (
            <div className="mt-2.5 space-y-2">
              {items.map((h) => {
                const badge = getCauseBadgeLabel(h);
                const isEditing = editingId === h.id;

                if (isEditing && !readOnly) {
                  return (
                    <div
                      key={h.id}
                      className="p-2.5 bg-white border border-cyan-400 rounded space-y-2 text-xs"
                    >
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                        placeholder="Cause title"
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as SixMCategory)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                      >
                        {ALL_6M_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editEvidence}
                        onChange={(e) => setEditEvidence(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                        placeholder="Supporting evidence"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 text-[11px] text-slate-600 border border-slate-300 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="px-2 py-1 text-[11px] text-white bg-cyan-700 rounded"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={h.id}
                    className={`p-2.5 rounded border text-xs transition-colors ${badge.boxClass}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectCause?.(h.id)}
                        className={`text-left font-medium leading-snug hover:underline ${badge.textClass}`}
                      >
                        {h.title}
                      </button>
                      {!readOnly && (
                        <div className="flex items-center gap-1 shrink-0">
                          {onEditCause && (
                            <button
                              type="button"
                              onClick={() => startEdit(h)}
                              title="Edit cause"
                              className="p-0.5 text-slate-500 hover:text-slate-900"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                          {onRemoveCause && (
                            <button
                              type="button"
                              onClick={() => onRemoveCause(h.id)}
                              title="Remove cause"
                              className="p-0.5 text-slate-500 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-600">
                      {h.managerStatus === 'Verified' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                      ) : h.managerStatus === 'Rejected' ? (
                        <XCircle className="w-3 h-3 text-red-600" aria-hidden="true" />
                      ) : h.evidenceSupported ? (
                        <FileCheck2 className="w-3 h-3 text-cyan-700" aria-hidden="true" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-slate-500" aria-hidden="true" />
                      )}
                      <span className="font-medium">{badge.label}</span>
                      {h.origin && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{h.origin}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5">
        <span className="font-semibold text-slate-700">
          Ishikawa 6M Fishbone Legend:
        </span>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-700">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span>AI-Suggested Hypothesis</span>
          </span>
          <span className="inline-flex items-center gap-1 text-cyan-900 font-medium">
            <FileCheck2 className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
            <span>Evidence-Supported</span>
          </span>
          <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>Manager Verified</span>
          </span>
          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
            <XCircle className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
            <span>Rejected Cause</span>
          </span>
        </div>
      </div>

      {/* Add Cause Modal/Drawer Inline */}
      {!readOnly && addingBranch && (
        <div className="p-4 bg-cyan-50/50 border border-cyan-200 rounded-md space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-slate-900">
              Add Root Cause Candidate to <span className="text-cyan-800">{addingBranch}</span> Branch
            </h4>
            <button
              type="button"
              onClick={() => setAddingBranch(null)}
              className="text-slate-500 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Cause title (e.g., Fixture clamp hydraulic leak)"
              className="px-3 py-2 bg-white border border-slate-300 rounded-md"
            />
            <input
              type="text"
              value={newEvidence}
              onChange={(e) => setNewEvidence(e.target.value)}
              placeholder="Supporting evidence / observation"
              className="px-3 py-2 bg-white border border-slate-300 rounded-md"
            />
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Detailed mechanism description (optional)"
              className="md:col-span-2 px-3 py-2 bg-white border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleSaveNew}
              disabled={!newTitle.trim()}
              className="px-4 py-1.5 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 disabled:opacity-50"
            >
              Add to {addingBranch}
            </button>
          </div>
        </div>
      )}

      {/* Interactive Fishbone Layout: 6M Ribs feeding Right-Side Problem Head */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[820px] grid grid-cols-12 gap-3 items-center">
          {/* Left 9 Columns: Top 3 Branches -> Central Spine -> Bottom 3 Branches */}
          <div className="col-span-9 space-y-2">
            {/* Top 3 Ribs */}
            <div className="grid grid-cols-3 gap-3 items-stretch">
              {TOP_BRANCHES.map((cat) => renderBranchCard(cat, true))}
            </div>

            {/* Central Horizontal Ishikawa Spine SVG */}
            <div className="py-1" aria-hidden="true">
              <svg
                viewBox="0 0 900 44"
                className="w-full h-11 overflow-visible"
                preserveAspectRatio="none"
              >
                {/* Rib connectors from top */}
                <line x1="150" y1="0" x2="185" y2="22" stroke="#64748b" strokeWidth="2" />
                <line x1="450" y1="0" x2="485" y2="22" stroke="#64748b" strokeWidth="2" />
                <line x1="750" y1="0" x2="785" y2="22" stroke="#64748b" strokeWidth="2" />
                {/* Rib connectors from bottom */}
                <line x1="150" y1="44" x2="185" y2="22" stroke="#64748b" strokeWidth="2" />
                <line x1="450" y1="44" x2="485" y2="22" stroke="#64748b" strokeWidth="2" />
                <line x1="750" y1="44" x2="785" y2="22" stroke="#64748b" strokeWidth="2" />
                {/* Main horizontal spine arrow pointing right */}
                <line x1="10" y1="22" x2="886" y2="22" stroke="#0B1426" strokeWidth="3.5" />
                <polygon points="884,14 900,22 884,30" fill="#0B1426" />
              </svg>
            </div>

            {/* Bottom 3 Ribs */}
            <div className="grid grid-cols-3 gap-3 items-stretch">
              {BOTTOM_BRANCHES.map((cat) => renderBranchCard(cat, false))}
            </div>
          </div>

          {/* Right 3 Columns: Main Problem Head Box */}
          <div className="col-span-3 flex items-center">
            <div className="w-full bg-[#0B1426] text-white border-2 border-cyan-500 rounded-lg p-4 space-y-2 shadow-sm">
              <p className="text-[11px] font-mono text-cyan-300">
                MAIN PROBLEM · {complaintId}
              </p>
              <p className="text-xs font-semibold leading-relaxed text-white">
                {problemStatement}
              </p>
              <p className="text-[11px] text-slate-300 pt-2 border-t border-slate-700">
                Process: {processName}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
