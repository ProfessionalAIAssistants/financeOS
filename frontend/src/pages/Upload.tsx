import { useState, useRef } from 'react';
import { useMutation } from '../hooks/useQuery';
import { uploadApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
// Button and Badge available for future use
import { Upload as UploadIcon, CheckCircle, XCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const INSTITUTIONS = ['chase', 'usaa', 'capitalone', 'macu', 'm1finance', 'fidelity', 'manual'];

interface UploadResult {
  success: boolean;
  added: number;
  skipped: number;
  institution: string;
  message?: string;
  error?: string;
}

export function Upload() {
  const [institution, setInstitution] = useState('manual');
  const [fileType, setFileType] = useState('auto');
  const [dragOver, setDragOver] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadApi.upload(file, institution, fileType),
    onSuccess: (data: UploadResult) => setResults(r => [data, ...r]),
    onError: (err: Error) => setResults(r => [{ success: false, added: 0, skipped: 0, institution, error: err.message }, ...r]),
  });

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    Array.from(files).forEach(f => uploadMutation.mutate(f));
  }

  return (
    <div className="space-y-6 max-w-2xl pb-20 md:pb-0">
      {/* Institution selector */}
      <Card>
        <CardHeader><CardTitle>Import Settings</CardTitle></CardHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>Institution</label>
            <div className="flex flex-wrap gap-2">
              {INSTITUTIONS.map(i => (
                <button key={i} onClick={() => setInstitution(i)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-all"
                  style={institution === i
                    ? { background: 'rgba(59,130,246,0.2)', borderColor: 'rgba(59,130,246,0.5)', color: '#93c5fd' }
                    : { background: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }
                  }>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs mb-2 block" style={{ color: 'var(--text-secondary)' }}>File Type</label>
            <div className="flex gap-2">
              {['auto', 'transactions', 'positions'].map(t => (
                <button key={t} onClick={() => setFileType(t)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border capitalize transition-all"
                  style={fileType === t
                    ? { background: 'rgba(147,51,234,0.2)', borderColor: 'rgba(168,85,247,0.5)', color: '#c4b5fd' }
                    : { background: 'var(--bg-input)', borderColor: 'var(--border-input)', color: 'var(--text-muted)' }
                  }>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className="relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all"
        style={dragOver
          ? { borderColor: '#60a5fa', background: 'rgba(59,130,246,0.1)' }
          : { borderColor: 'var(--border-input)', background: 'transparent' }
        }
      >
        <input ref={fileRef} type="file" className="hidden" multiple accept=".ofx,.qfx,.csv,.txt"
          onChange={e => handleFiles(e.target.files)} />
        <UploadIcon className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="text-base font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Drop files here or click to browse</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Supports .OFX, .QFX, .CSV files</p>
        {uploadMutation.isPending && (
          <div className="mt-4">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>Processing...</p>
          </div>
        )}
      </div>

      {/* Results */}
      <AnimatePresence>
        {results.map((r, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`glass p-4 flex items-start gap-3 ${r.success ? 'border-emerald-500/20' : 'border-red-500/20'}`}
          >
            {r.success
              ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
            <div>
              <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{r.institution}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {r.success ? r.message ?? `+${r.added} imported, ${r.skipped} skipped` : r.error}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Instructions */}
      <Card>
        <CardHeader><CardTitle>Export Instructions</CardTitle></CardHeader>
        <div className="space-y-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex gap-3">
            <FileText className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Chase / USAA</p>
              <p>These sync automatically via OFX Direct Connect. Upload only if auto-sync fails.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <FileText className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Fidelity Positions</p>
              <p>Accounts → Portfolio → Download (CSV). Set File Type = Positions.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <FileText className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>M1 Finance</p>
              <p>Account → Activity / Holdings → Export CSV. Set institution = m1finance.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <FileText className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Capital One / MACU</p>
              <p>These sync automatically via finance-dl. Upload only if auto-sync fails.</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
