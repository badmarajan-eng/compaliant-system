import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  GitBranch,
  LayoutDashboard,
  Menu,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { ComplaintFormModal } from './components/ComplaintFormModal';
import { CsvImportModal } from './components/CsvImportModal';
import { usePredictiveStore } from './hooks/usePredictiveStore';
import { useQmsStore } from './hooks/useQmsStore';
import { AlertCenterView } from './modules/AlertCenterView';
import { AnalyticsView } from './modules/AnalyticsView';
import { CapaView } from './modules/CapaView';
import { ClassificationView } from './modules/ClassificationView';
import { ComplaintsView } from './modules/ComplaintsView';
import { DashboardView, type ComplaintPresetFilter } from './modules/DashboardView';
import { EffectivenessView } from './modules/EffectivenessView';
import { ReportsView } from './modules/ReportsView';
import { RiskPredictionView } from './modules/RiskPredictionView';
import { RootCauseView } from './modules/RootCauseView';
import type { ModuleId } from './types/qms';
import { generateNextComplaintId } from './utils/csvUtils';

interface NavItem {
  id: ModuleId;
  label: string;
  description: string;
  Icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Executive quality KPIs & risk summary',
    Icon: LayoutDashboard,
  },
  {
    id: 'complaints',
    label: 'Complaint Management',
    description: 'Register, search, import & manage complaints',
    Icon: ClipboardList,
  },
  {
    id: 'classification',
    label: 'AI Complaint Classification',
    description: 'Gemini defect taxonomy & keyword triage',
    Icon: Sparkles,
  },
  {
    id: 'root-cause',
    label: 'Root Cause Analysis',
    description: 'Hypotheses, historical links & verification',
    Icon: GitBranch,
  },
  {
    id: 'analytics',
    label: 'Trend & Pattern Analytics',
    description: 'Pareto, chronic defects, correlations & heatmaps',
    Icon: BarChart3,
  },
  {
    id: 'risk-prediction',
    label: 'Predictive Quality Intelligence',
    description: 'Product, process, batch risk, forecasts & alerts',
    Icon: ShieldAlert,
  },
  {
    id: 'capa',
    label: 'CAPA Management',
    description: 'Corrective & preventive action plans',
    Icon: Wrench,
  },
  {
    id: 'effectiveness',
    label: 'Effectiveness Monitoring',
    description: 'Before/after verification & reduction rates',
    Icon: CheckCircle2,
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    description: 'Executive management reports, CSV & print views',
    Icon: FileSpreadsheet,
  },
  {
    id: 'alerts',
    label: 'Alert Center',
    description: 'Post-CAPA recurrences, overdue CAPAs & predictive alerts',
    Icon: Bell,
  },
];

export default function App() {
  const {
    complaints,
    capaRecords,
    addComplaint,
    importComplaints,
    updateComplaint,
    deleteComplaint,
    saveClassification,
    saveManagerVerification,
    saveRootCauseAnalysis,
    addCapaRecord,
    updateCapaRecord,
    deleteCapaRecord,
    resetDemoData,
  } = useQmsStore();

  const predictiveStore = usePredictiveStore(complaints, capaRecords);

  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [complaintPresetFilter, setComplaintPresetFilter] =
    useState<ComplaintPresetFilter | null>(null);
  const [complaintsInitialSubView, setComplaintsInitialSubView] = useState<
    'list' | 'register'
  >('list');
  const [complaintsNavResetKey, setComplaintsNavResetKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickRegisterOpen, setQuickRegisterOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const currentNav = useMemo(
    () => NAV_ITEMS.find((item) => item.id === activeModule) ?? NAV_ITEMS[0],
    [activeModule]
  );

  const suggestedId = useMemo(() => generateNextComplaintId(complaints), [complaints]);

  const currentDateDisplay = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const activePredictiveAlerts = useMemo(
    () => predictiveStore.alerts.filter((a) => a.status !== 'Resolved'),
    [predictiveStore.alerts]
  );

  const liveAlerts = useMemo(() => {
    return activePredictiveAlerts.slice(0, 8).map((a) => ({
      id: a.id,
      title: `${a.alertType}: ${a.targetEntity}`,
      detail: a.reason,
      targetModule: 'alerts' as ModuleId,
      complaintId: undefined,
    }));
  }, [activePredictiveAlerts]);

  const handleNavigate = (
    module: ModuleId,
    complaintId?: string,
    presetFilter?: ComplaintPresetFilter
  ) => {
    setActiveModule(module);
    if (complaintId !== undefined) {
      setSelectedComplaintId(complaintId);
    } else if (module === 'complaints') {
      setSelectedComplaintId(null);
    }
    setComplaintPresetFilter(presetFilter ?? null);
    setComplaintsInitialSubView('list');
    if (module === 'complaints' && complaintId === undefined) {
      setComplaintsNavResetKey((k) => k + 1);
    }
    setMobileNavOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  };

  const handleOpenRegistrationPage = () => {
    setActiveModule('complaints');
    setSelectedComplaintId(null);
    setComplaintPresetFilter(null);
    setComplaintsInitialSubView('register');
    setComplaintsNavResetKey((k) => k + 1);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Dark Navy Industrial Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B1426] text-slate-200 flex flex-col border-r border-slate-800 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
              <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
                Q-INTELLIGENCE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              AI-Powered Customer Complaint Analytics
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav aria-label="QMS Modules" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activeModule === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleNavigate(id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-cyan-400' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{label}</span>
                </span>
                {id === 'alerts' && activePredictiveAlerts.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono tabular-nums font-semibold rounded bg-red-600 text-white shrink-0">
                    {activePredictiveAlerts.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-2.5">
          <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono tabular-nums">
            <span>Stored Records</span>
            <span className="text-slate-200 font-semibold">{complaints.length}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-md border border-slate-200"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">Q-INTELLIGENCE</span>
                <span aria-hidden="true">·</span>
                <span className="hidden md:inline truncate">
                  AI-Powered Customer Complaint Analytics
                </span>
                <span className="hidden md:inline" aria-hidden="true">/</span>
                <span className="font-medium text-cyan-800 truncate">{currentNav.label}</span>
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Current Date */}
            <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-600 font-mono tabular-nums pr-2 border-r border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>{currentDateDisplay}</span>
            </div>

            {/* Register CTA */}
            <button
              type="button"
              onClick={() => setQuickRegisterOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>New Complaint</span>
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((v) => !v);
                  setProfileOpen(false);
                }}
                aria-label="View quality alerts and notifications"
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                {activePredictiveAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-mono tabular-nums flex items-center justify-center font-semibold">
                    {activePredictiveAlerts.length}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      Active Quality Alerts ({activePredictiveAlerts.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotificationsOpen(false)}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Close notifications"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {liveAlerts.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500">
                        No open predictive, CAPA, or post-CAPA recurrence alerts.
                      </p>
                    ) : (
                      liveAlerts.map((alert) => (
                        <button
                          key={alert.id}
                          type="button"
                          onClick={() =>
                            handleNavigate(alert.targetModule, alert.complaintId)
                          }
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <p className="text-xs font-semibold text-slate-900">{alert.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.detail}</p>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => handleNavigate('alerts')}
                      className="text-xs font-semibold text-cyan-800 hover:underline"
                    >
                      Open Alert Center ({activePredictiveAlerts.length})
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quality Manager Profile Section */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotificationsOpen(false);
                }}
                className="inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <span className="w-7 h-7 rounded-md bg-[#0B1426] text-cyan-400 text-xs font-semibold flex items-center justify-center shrink-0">
                  QM
                </span>
                <span className="hidden md:block text-left leading-tight">
                  <span className="block text-xs font-semibold text-slate-900">
                    R. Deshmukh
                  </span>
                  <span className="block text-[11px] text-slate-500">Quality Manager</span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" aria-hidden="true" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 text-xs">
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-cyan-700" aria-hidden="true" />
                      <span>R. Deshmukh</span>
                    </p>
                    <p className="text-slate-500 mt-0.5">Quality Manager · Plant Operations</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate('reports')}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    Export Quality Audit Reports
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setCsvImportOpen(true);
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    Import Historical CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setResetConfirmOpen(true);
                    }}
                    className="w-full text-left px-4 py-2 text-red-700 hover:bg-red-50 border-t border-slate-100"
                  >
                    Reset Demo Data
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeModule === 'dashboard' && (
            <DashboardView
              complaints={complaints}
              onNavigate={handleNavigate}
              onOpenNewComplaint={handleOpenRegistrationPage}
              onOpenCsvImport={() => setCsvImportOpen(true)}
            />
          )}

          {activeModule === 'complaints' && (
            <ComplaintsView
              complaints={complaints}
              preselectedId={selectedComplaintId}
              presetFilter={complaintPresetFilter}
              initialSubView={complaintsInitialSubView}
              navResetKey={complaintsNavResetKey}
              onAddComplaint={addComplaint}
              onOpenCsvImport={() => setCsvImportOpen(true)}
              onUpdateComplaint={updateComplaint}
              onDeleteComplaint={deleteComplaint}
              onSaveClassification={saveClassification}
              onSaveManagerVerification={saveManagerVerification}
              onNavigateModule={handleNavigate}
            />
          )}

          {activeModule === 'classification' && (
            <ClassificationView
              complaints={complaints}
              preselectedId={selectedComplaintId}
              onSaveClassification={saveClassification}
              onSaveManagerVerification={saveManagerVerification}
            />
          )}

          {activeModule === 'root-cause' && (
            <RootCauseView
              complaints={complaints}
              preselectedId={selectedComplaintId}
              onSaveRca={saveRootCauseAnalysis}
            />
          )}

          {activeModule === 'analytics' && (
            <AnalyticsView complaints={complaints} onNavigate={handleNavigate} />
          )}

          {activeModule === 'risk-prediction' && (
            <RiskPredictionView
              complaints={complaints}
              capaRecords={capaRecords}
              predictiveStore={predictiveStore}
              onNavigate={handleNavigate}
            />
          )}

          {activeModule === 'capa' && (
            <CapaView
              complaints={complaints}
              capaRecords={capaRecords}
              preselectedId={selectedComplaintId}
              onAddCapa={addCapaRecord}
              onUpdateCapa={updateCapaRecord}
              onDeleteCapa={deleteCapaRecord}
              onNavigate={handleNavigate}
            />
          )}

          {activeModule === 'effectiveness' && (
            <EffectivenessView
              complaints={complaints}
              capaRecords={capaRecords}
              onUpdateCapa={updateCapaRecord}
              onNavigate={handleNavigate}
            />
          )}

          {activeModule === 'reports' && (
            <ReportsView complaints={complaints} capaRecords={capaRecords} />
          )}

          {activeModule === 'alerts' && (
            <AlertCenterView
              alerts={predictiveStore.alerts}
              onUpdateAlert={predictiveStore.updateAlert}
              onNavigate={handleNavigate}
            />
          )}
        </main>
      </div>

      {/* Quick Register Complaint Modal */}
      <ComplaintFormModal
        isOpen={quickRegisterOpen}
        suggestedId={suggestedId}
        onClose={() => setQuickRegisterOpen(false)}
        onSave={(data) => {
          const created = addComplaint(data);
          setSelectedComplaintId(created.id);
          setActiveModule('complaints');
        }}
      />

      {/* Shared CSV Import Modal */}
      <CsvImportModal
        isOpen={csvImportOpen}
        existingComplaints={complaints}
        onClose={() => setCsvImportOpen(false)}
        onConfirmImport={(records) => {
          importComplaints(records);
        }}
      />

      {/* Reset Demo Data Confirmation */}
      {resetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Reset Demo Data?</h2>
            <p className="text-sm text-slate-600 mt-2">
              This will restore the original 44 synthetic manufacturing complaint records (marked DEMO DATA) and discard any custom edits or added records in LocalStorage.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetDemoData();
                  setSelectedComplaintId(null);
                  setComplaintPresetFilter(null);
                  setResetConfirmOpen(false);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-cyan-700 rounded-md hover:bg-cyan-800"
              >
                Restore 44 Demo Records
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
