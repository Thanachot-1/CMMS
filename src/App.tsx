import React, { useState, useMemo, useEffect } from 'react';
import { 
  Wrench, AlertTriangle, CheckCircle, Clock, 
  Plus, ArrowLeft, Save, Activity, Settings,
  AlertCircle, FileText, ChevronRight, Trash2,
  Camera, Image as ImageIcon, X
} from 'lucide-react';
import { ref, onValue, push, set, remove } from 'firebase/database';
import { database } from './firebase';

// --- Mock Data & Types ---

type WorkCenter = string;

interface Machine {
  id: string;
  name: string;
  serial: string;
  model: string;
}

const DEFAULT_MACHINES: Record<string, Machine[]> = {
  'WC-04': [
    { id: 'WC04-01', name: 'Lathe A', serial: 'SN-1001', model: 'Haas ST-20' },
    { id: 'WC04-02', name: 'Lathe B', serial: 'SN-1002', model: 'Haas ST-20' },
  ],
  'CNC Shop': [
    { id: 'CNC-01', name: 'Mill 5-Axis', serial: 'SN-2005', model: 'Mazak Variaxis' },
    { id: 'CNC-02', name: 'Vertical Mill', serial: 'SN-2006', model: 'Haas VF-2' },
  ],
  'Grinding': [
    { id: 'GRD-01', name: 'Surface Grinder', serial: 'SN-3010', model: 'Okamoto' },
  ]
};

type Condition = 'Down' | 'Partial' | 'Operational';
type RepairAction = 'Permanent' | 'Temporary' | 'Inspection';

interface Report {
  id: string;
  workCenter: WorkCenter | '';
  machineId: string;
  diagnosis: string;
  troubleshooting: string;
  repairAction: RepairAction | '';
  repairDetails: string;
  conditionBefore: Condition | '';
  conditionAfter: Condition | '';
  nextPlan: string;
  startTime: string;
  endTime: string;
  timestamp: number;
  imageUrls?: string[];
}

// --- Helper Functions ---

const calculateDowntime = (start: string, end: string) => {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  
  if (diffMs < 0) return 'Invalid time range';
  
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (hours > 0) {
    return `${hours} hr ${mins} min`;
  }
  return `${mins} min`;
};

const getConditionColor = (condition: Condition | '') => {
  switch (condition) {
    case 'Operational': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    case 'Partial': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'Down': return 'text-red-600 bg-red-50 border-red-200';
    default: return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

// --- Components ---

export default function App() {
  const [view, setView] = useState<'dashboard' | 'form' | 'details' | 'settings'>('dashboard');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [masterData, setMasterData] = useState<Record<string, Machine[]>>(DEFAULT_MACHINES);
  const [masterDataLoading, setMasterDataLoading] = useState(true);

  useEffect(() => {
    const masterDataRef = ref(database, 'masterData');
    const unsubscribeMaster = onValue(masterDataRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setMasterData(data);
      } else {
        // Seed initial data if none exists
        set(masterDataRef, DEFAULT_MACHINES);
        setMasterData(DEFAULT_MACHINES);
      }
      setMasterDataLoading(false);
    });

    const reportsRef = ref(database, 'reports');
    const unsubscribeReports = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const reportsList = Object.entries(data).map(([key, value]: [string, any]) => ({
          ...value,
          id: key // Ensure id matches the Firebase key exactly
        })) as Report[];
        // Sort by timestamp descending
        reportsList.sort((a, b) => b.timestamp - a.timestamp);
        setReports(reportsList);
      } else {
        setReports([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching reports: ", error);
      setLoading(false);
    });

    return () => {
      unsubscribeMaster();
      unsubscribeReports();
    };
  }, []);

  if (masterDataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center text-slate-400">
          <Activity className="animate-pulse mb-2" size={32} />
          <p>Loading application data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Mobile-first container */}
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-2xl overflow-hidden relative flex flex-col">
        {view === 'dashboard' && (
          <Dashboard 
            reports={reports} 
            loading={loading}
            masterData={masterData}
            onNewReport={() => setView('form')} 
            onViewDetails={(report) => {
              setSelectedReport(report);
              setView('details');
            }}
            onOpenSettings={() => setView('settings')}
          />
        )}
        {view === 'form' && (
          <RepairForm 
            masterData={masterData}
            onCancel={() => setView('dashboard')} 
            onSubmit={async (report) => {
              try {
                await set(ref(database, `reports/${report.id}`), report);
                setView('dashboard');
              } catch (e) {
                console.error("Error saving report: ", e);
                alert("Failed to save report. Please try again.");
              }
            }} 
          />
        )}
        {view === 'details' && selectedReport && (
          <ReportDetails 
            report={selectedReport} 
            masterData={masterData}
            onBack={() => setView('dashboard')} 
          />
        )}
        {view === 'settings' && (
          <SettingsView 
            masterData={masterData}
            onBack={() => setView('dashboard')}
            onSave={async (newData) => {
              try {
                await set(ref(database, 'masterData'), newData);
                setView('dashboard');
              } catch (e) {
                console.error("Error saving master data: ", e);
                alert("Failed to save settings. Please try again.");
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function Dashboard({ 
  reports, 
  loading, 
  masterData,
  onNewReport, 
  onViewDetails,
  onOpenSettings
}: { 
  reports: Report[], 
  loading: boolean, 
  masterData: Record<string, Machine[]>,
  onNewReport: () => void, 
  onViewDetails: (report: Report) => void,
  onOpenSettings: () => void
}) {
  const activeIssues = reports.filter(r => r.conditionAfter !== 'Operational').length;
  const tempRepairs = reports.filter(r => r.repairAction === 'Temporary').length;

  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent any parent click handlers
    setReportToDelete(id);
  };

  const confirmDelete = async () => {
    if (!reportToDelete) return;
    
    try {
      console.log(`Attempting to delete report with ID: ${reportToDelete}`);
      const reportRef = ref(database, `reports/${reportToDelete}`);
      await remove(reportRef);
      console.log(`Successfully deleted report: ${reportToDelete}`);
      setReportToDelete(null);
      setTimeout(() => {
        alert("Report deleted successfully!");
      }, 100);
    } catch (error: any) {
      console.error("Error deleting document: ", error);
      alert(`Failed to delete report: ${error?.message || 'Unknown error'}\n\nPlease check your Firebase Database Rules (must allow .write).`);
      setReportToDelete(null);
    }
  };

  const cancelDelete = () => {
    setReportToDelete(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-slate-900 text-white pt-12 pb-6 px-6 rounded-b-3xl shadow-md z-10">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
            <p className="text-slate-400 text-sm">Tech Portal v2.0</p>
          </div>
          <div 
            className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
            onClick={onOpenSettings}
          >
            <Settings size={20} className="text-slate-300" />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <AlertTriangle size={16} />
              <span className="text-xs font-medium uppercase tracking-wider">Active Issues</span>
            </div>
            <p className="text-3xl font-light">{activeIssues}</p>
          </div>
          <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <Clock size={16} />
              <span className="text-xs font-medium uppercase tracking-wider">Temp Fixes</span>
            </div>
            <p className="text-3xl font-light">{tempRepairs}</p>
          </div>
        </div>
      </header>

      {/* Recent Reports List */}
      <div className="flex-1 overflow-y-auto p-6 pb-24">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Recent Reports</h2>
          <button className="text-sm text-blue-600 font-medium">View All</button>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Activity className="animate-pulse mb-2" size={24} />
              <p className="text-sm">Loading reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <FileText className="mb-2 opacity-50" size={24} />
              <p className="text-sm">No reports found.</p>
            </div>
          ) : reports.map((report) => {
            const machine = masterData[report.workCenter]?.find(m => m.id === report.machineId);
            
            return (
              <div 
                key={report.id} 
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onViewDetails(report)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="text-xs font-mono text-slate-500">{report.id}</span>
                    <h3 className="font-semibold text-slate-900">{machine?.name || report.machineId}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${getConditionColor(report.conditionAfter)}`}>
                      {report.conditionAfter}
                    </span>
                    <button 
                      onClick={(e) => handleDeleteClick(report.id, e)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50"
                      title="Delete Report"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                  {report.diagnosis}
                </p>
                
                <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-3">
                    {report.imageUrls && report.imageUrls.length > 0 && (
                      <div className="flex items-center gap-1 text-slate-400">
                        <ImageIcon size={14} />
                        <span>{report.imageUrls.length}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Wrench size={14} />
                      <span>{report.repairAction}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={14} />
                    <span>{new Date(report.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAB */}
      <div className="absolute bottom-6 right-6">
        <button 
          onClick={onNewReport}
          className="h-14 w-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center transition-transform active:scale-95"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Custom Confirmation Modal */}
      {reportToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold text-slate-900">Delete Report?</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Are you sure you want to delete this report? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={cancelDelete}
                className="flex-1 py-2.5 rounded-xl font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RepairForm({ 
  onCancel, 
  onSubmit,
  masterData
}: { 
  onCancel: () => void, 
  onSubmit: (report: Report) => Promise<void> | void,
  masterData: Record<string, Machine[]>
}) {
  const [formData, setFormData] = useState<Partial<Report>>({
    workCenter: '',
    machineId: '',
    diagnosis: '',
    troubleshooting: '',
    repairAction: '',
    repairDetails: '',
    conditionBefore: '',
    conditionAfter: '',
    nextPlan: '',
    startTime: '',
    endTime: ''
  });
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // Derived state for dependent dropdowns and auto-population
  const availableMachines = formData.workCenter ? masterData[formData.workCenter] || [] : [];
  const selectedMachine = availableMachines.find(m => m.id === formData.machineId);

  // Logic for mandatory "Next Plan"
  const isNextPlanRequired = formData.conditionAfter !== 'Operational' || formData.repairAction === 'Temporary';

  // Validation
  const isFormValid = 
    formData.workCenter && 
    formData.machineId && 
    formData.diagnosis && 
    formData.troubleshooting && 
    formData.repairAction && 
    formData.conditionBefore && 
    formData.conditionAfter && 
    formData.startTime && 
    formData.endTime &&
    (!isNextPlanRequired || (isNextPlanRequired && formData.nextPlan?.trim().length > 0));

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setImages(prev => [...prev, ...filesArray]);
      
      const previews = filesArray.map(file => URL.createObjectURL(file));
      setImagePreviews(prev => [...prev, ...previews]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    
    try {
      const uploadedUrls: string[] = [];
      for (const file of images) {
        const base64 = await fileToBase64(file);
        uploadedUrls.push(base64);
      }

      const newReport: Report = {
        ...formData as Report,
        id: `REP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random() * 1000)}`,
        timestamp: Date.now(),
        imageUrls: uploadedUrls
      };
      
      await onSubmit(newReport);
    } catch (error: any) {
      console.error("Error saving report:", error);
      alert(`Failed to save report: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: keyof Report, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      // Reset machine if work center changes
      if (field === 'workCenter') {
        newData.machineId = '';
      }
      return newData;
    });
  };

  const downtime = calculateDowntime(formData.startTime || '', formData.endTime || '');

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-20">
        <button onClick={onCancel} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-semibold text-slate-800">New Repair Report</h2>
        <div className="w-9" /> {/* Spacer for centering */}
      </header>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <form id="repair-form" onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section 1: Machine Identification */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4 text-slate-800 font-medium">
              <Activity size={18} className="text-blue-600" />
              <h3>Machine Identification</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Work Center *</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none appearance-none"
                  value={formData.workCenter}
                  onChange={(e) => updateField('workCenter', e.target.value)}
                  required
                >
                  <option value="" disabled>Select Work Center</option>
                  {Object.keys(masterData).map(wc => (
                    <option key={wc} value={wc}>{wc}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Machine *</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none appearance-none disabled:opacity-50 disabled:bg-slate-100"
                  value={formData.machineId}
                  onChange={(e) => updateField('machineId', e.target.value)}
                  disabled={!formData.workCenter}
                  required
                >
                  <option value="" disabled>Select Machine</option>
                  {availableMachines.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                  ))}
                </select>
              </div>

              {/* Auto-populated details */}
              {selectedMachine && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400 font-semibold">Serial No.</span>
                    <span className="text-sm font-mono text-slate-700">{selectedMachine.serial}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400 font-semibold">Model</span>
                    <span className="text-sm text-slate-700">{selectedMachine.model}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: Technical Reporting */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4 text-slate-800 font-medium">
              <FileText size={18} className="text-blue-600" />
              <h3>Technical Reporting</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Diagnosis (Root Cause) *</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none min-h-[80px] resize-none"
                  placeholder="Describe the root cause..."
                  value={formData.diagnosis}
                  onChange={(e) => updateField('diagnosis', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Troubleshooting Steps *</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none min-h-[80px] resize-none"
                  placeholder="Steps taken to find the fault..."
                  value={formData.troubleshooting}
                  onChange={(e) => updateField('troubleshooting', e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Repair Action *</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Permanent', 'Temporary', 'Inspection'].map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => updateField('repairAction', action)}
                      className={`py-2 px-1 text-xs font-medium rounded-lg border transition-colors ${
                        formData.repairAction === action 
                          ? 'bg-blue-50 border-blue-600 text-blue-700' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Repair Details</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none min-h-[80px] resize-none"
                  placeholder="Detailed description of the repair..."
                  value={formData.repairDetails}
                  onChange={(e) => updateField('repairDetails', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Section 3: Operational Status & Time */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4 text-slate-800 font-medium">
              <AlertCircle size={18} className="text-blue-600" />
              <h3>Status & Time</h3>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Condition Before *</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none appearance-none"
                    value={formData.conditionBefore}
                    onChange={(e) => updateField('conditionBefore', e.target.value)}
                    required
                  >
                    <option value="" disabled>Select</option>
                    <option value="Down">Down</option>
                    <option value="Partial">Partial</option>
                    <option value="Operational">Operational</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Condition After *</label>
                  <select 
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none appearance-none ${
                      formData.conditionAfter ? getConditionColor(formData.conditionAfter as Condition) : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                    value={formData.conditionAfter}
                    onChange={(e) => updateField('conditionAfter', e.target.value)}
                    required
                  >
                    <option value="" disabled>Select</option>
                    <option value="Down">Down</option>
                    <option value="Partial">Partial</option>
                    <option value="Operational">Operational</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Start Time *</label>
                  <input 
                    type="datetime-local"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                    value={formData.startTime}
                    onChange={(e) => updateField('startTime', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">End Time *</label>
                  <input 
                    type="datetime-local"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none"
                    value={formData.endTime}
                    onChange={(e) => updateField('endTime', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Downtime Calculation Display */}
              {downtime && (
                <div className="bg-blue-50 text-blue-800 rounded-xl p-3 flex items-center justify-between border border-blue-100">
                  <span className="text-sm font-medium">Total Downtime:</span>
                  <span className="font-mono font-semibold">{downtime}</span>
                </div>
              )}

              {/* Conditional Next Plan */}
              <div className={`transition-all duration-300 overflow-hidden ${isNextPlanRequired ? 'opacity-100 max-h-40' : 'opacity-50 max-h-40'}`}>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Next Plan {isNextPlanRequired && <span className="text-red-500">*</span>}
                </label>
                <textarea 
                  className={`w-full bg-slate-50 border text-slate-900 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none min-h-[80px] resize-none ${
                    isNextPlanRequired && !formData.nextPlan ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200'
                  }`}
                  placeholder={isNextPlanRequired ? "Required: Describe follow-up actions..." : "Optional follow-up actions..."}
                  value={formData.nextPlan}
                  onChange={(e) => updateField('nextPlan', e.target.value)}
                  required={isNextPlanRequired}
                />
                {isNextPlanRequired && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    Required because machine is not operational or repair is temporary.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 4: Images */}
          <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4 text-slate-800 font-medium">
              <Camera size={18} className="text-blue-600" />
              <h3>Photos</h3>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200">
                    <img src={preview} alt={`Preview ${index}`} className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer">
                  <Camera size={24} className="mb-1" />
                  <span className="text-xs font-medium">Add Photo</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple 
                    className="hidden" 
                    onChange={handleImageChange}
                  />
                </label>
              </div>
            </div>
          </section>
        </form>
      </div>

      {/* Footer Actions */}
      <div className="bg-white border-t border-slate-200 p-4 absolute bottom-0 w-full z-20">
        <button
          type="submit"
          form="repair-form"
          disabled={!isFormValid || isSubmitting}
          className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
            isFormValid && !isSubmitting
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20' 
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <Activity className="animate-spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          {isSubmitting ? 'Saving...' : 'Submit Report'}
        </button>
      </div>
    </div>
  );
}

function ReportDetails({ 
  report, 
  onBack,
  masterData
}: { 
  report: Report, 
  onBack: () => void,
  masterData: Record<string, Machine[]>
}) {
  const machine = masterData[report.workCenter]?.find(m => m.id === report.machineId);
  const downtime = calculateDowntime(report.startTime, report.endTime);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-20">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <h2 className="font-semibold text-slate-800">Report Details</h2>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-10">
        {/* Header Info */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{machine?.name || report.machineId}</h1>
              <p className="text-sm text-slate-500 font-mono mt-1">{report.id}</p>
            </div>
            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${getConditionColor(report.conditionAfter)}`}>
              {report.conditionAfter}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Work Center</span>
              <span className="font-medium text-slate-800">{report.workCenter}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-400 uppercase tracking-wider mb-1">Date</span>
              <span className="font-medium text-slate-800">{new Date(report.timestamp).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Issue & Action */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <AlertTriangle size={14} /> Issue / Diagnosis
            </h3>
            <p className="text-slate-800 text-sm whitespace-pre-wrap">{report.diagnosis}</p>
          </div>
          
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Wrench size={14} /> Action Taken ({report.repairAction})
            </h3>
            <p className="text-slate-800 text-sm whitespace-pre-wrap">{report.troubleshooting}</p>
            {report.repairDetails && (
              <p className="text-slate-600 text-sm whitespace-pre-wrap mt-2">{report.repairDetails}</p>
            )}
          </div>

          {report.nextPlan && (
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ChevronRight size={14} /> Next Action
              </h3>
              <p className="text-slate-800 text-sm whitespace-pre-wrap">{report.nextPlan}</p>
            </div>
          )}
        </div>

        {/* Time Tracking */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
           <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Clock size={14} /> Time Tracking
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <span className="block text-[10px] text-slate-400 uppercase">Start</span>
                <span className="text-sm font-medium text-slate-800">{new Date(report.startTime).toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 uppercase">End</span>
                <span className="text-sm font-medium text-slate-800">{new Date(report.endTime).toLocaleString()}</span>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100">
              <span className="text-sm text-slate-600">Total Downtime</span>
              <span className="font-mono font-bold text-slate-900">{downtime}</span>
            </div>
        </div>

        {/* Images */}
        {report.imageUrls && report.imageUrls.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
              <ImageIcon size={14} /> Photos
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {report.imageUrls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 transition-opacity">
                  <img src={url} alt={`Report photo ${i+1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView({ 
  masterData, 
  onBack, 
  onSave 
}: { 
  masterData: Record<string, Machine[]>, 
  onBack: () => void, 
  onSave: (data: Record<string, Machine[]>) => Promise<void> 
}) {
  const [data, setData] = useState<Record<string, Machine[]>>(masterData);
  const [newWc, setNewWc] = useState('');
  const [newMachine, setNewMachine] = useState({ wc: '', id: '', name: '', serial: '', model: '' });
  const [isSaving, setIsSaving] = useState(false);

  const handleAddWc = () => {
    if (!newWc.trim() || data[newWc.trim()]) return;
    setData({ ...data, [newWc.trim()]: [] });
    setNewWc('');
  };

  const handleDeleteWc = (wc: string) => {
    if (!window.confirm(`Delete Work Center "${wc}" and all its machines?`)) return;
    const newData = { ...data };
    delete newData[wc];
    setData(newData);
  };

  const handleAddMachine = (wc: string) => {
    if (!newMachine.id.trim() || !newMachine.name.trim()) return;
    const newData = { ...data };
    newData[wc] = [...(newData[wc] || []), { ...newMachine, id: newMachine.id.trim(), name: newMachine.name.trim() }];
    setData(newData);
    setNewMachine({ wc: '', id: '', name: '', serial: '', model: '' });
  };

  const handleDeleteMachine = (wc: string, machineId: string) => {
    if (!window.confirm(`Delete machine?`)) return;
    const newData = { ...data };
    newData[wc] = newData[wc].filter(m => m.id !== machineId);
    setData(newData);
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave(data);
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-slate-800">Master Data</h1>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {/* Add Work Center */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Add Work Center</h2>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newWc}
              onChange={e => setNewWc(e.target.value)}
              placeholder="e.g. CNC Shop 2"
              className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button 
              onClick={handleAddWc}
              className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        {/* List Work Centers */}
        {Object.entries(data).map(([wc, machines]) => (
          <div key={wc} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{wc}</h3>
              <button 
                onClick={() => handleDeleteWc(wc)}
                className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="space-y-3 mb-4">
              {machines.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div>
                    <div className="font-medium text-sm text-slate-800">{m.name} <span className="text-xs text-slate-500 font-mono ml-1">({m.id})</span></div>
                    <div className="text-xs text-slate-500 mt-0.5">{m.model} • {m.serial}</div>
                  </div>
                  <button 
                    onClick={() => handleDeleteMachine(wc, m.id)}
                    className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {machines.length === 0 && (
                <p className="text-sm text-slate-500 italic">No machines added yet.</p>
              )}
            </div>

            {/* Add Machine Form */}
            {newMachine.wc === wc ? (
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 space-y-3">
                <input 
                  type="text" placeholder="Machine ID (e.g. CNC-03)"
                  value={newMachine.id} onChange={e => setNewMachine({...newMachine, id: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <input 
                  type="text" placeholder="Machine Name"
                  value={newMachine.name} onChange={e => setNewMachine({...newMachine, name: e.target.value})}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="flex gap-2">
                  <input 
                    type="text" placeholder="Model"
                    value={newMachine.model} onChange={e => setNewMachine({...newMachine, model: e.target.value})}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <input 
                    type="text" placeholder="Serial"
                    value={newMachine.serial} onChange={e => setNewMachine({...newMachine, serial: e.target.value})}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button 
                    onClick={() => setNewMachine({ wc: '', id: '', name: '', serial: '', model: '' })}
                    className="flex-1 bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleAddMachine(wc)}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    Save Machine
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setNewMachine({ wc, id: '', name: '', serial: '', model: '' })}
                className="w-full py-2 border border-dashed border-slate-300 text-slate-500 rounded-xl text-sm font-medium hover:bg-slate-50 hover:text-slate-700 transition-colors flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add Machine
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
