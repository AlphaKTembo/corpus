'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

type MedicalFolder = { name: string; createdAt: string; documentCount: number };
type MedicalDoc = {
  id: string; type: string; date: string; filename: string;
  originalName: string; source: string; folder?: string; createdAt: string;
};
type UploadItem = {
  uid: string;
  file: File;
  status: 'blocked' | 'previewing' | 'awaiting_approval' | 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  note?: string; // success annotation (e.g. ZIP extraction count)
  preview?: {
    type: string;
    date: string;
    extractedRows: number;
    sampleRows: Array<Record<string, string | number>>;
    warning?: string;
  };
};

const BLOCKED_EXTS = ['.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'];
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB (matches nginx + multer)

function getExt(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  card: {
    background: '#fff', borderRadius: '20px', border: '1px solid #e5e7eb',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '1.5rem', marginBottom: '1.25rem',
  } as React.CSSProperties,
  btn: (v: 'primary' | 'ghost' | 'danger' | 'outline', disabled = false): React.CSSProperties => ({
    padding: v === 'primary' ? '0.65rem 1.4rem' : '0.5rem 1rem',
    borderRadius: '10px', border: v === 'outline' ? '1.5px solid #d1d5db' : 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
    fontSize: '0.875rem', opacity: disabled ? 0.5 : 1, transition: 'opacity .15s',
    background: v === 'primary' ? '#111' : v === 'danger' ? '#fef2f2' : v === 'outline' ? '#fff' : '#f3f4f6',
    color: v === 'primary' ? '#fff' : v === 'danger' ? '#dc2626' : '#374151',
    boxShadow: v === 'primary' && !disabled ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
  }),
  input: {
    width: '100%', padding: '0.6rem 0.875rem', borderRadius: '10px',
    border: '1.5px solid #d1d5db', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties,
  msg: (isErr: boolean): React.CSSProperties => ({
    padding: '0.6rem 0.875rem', borderRadius: '10px', fontSize: '0.85rem',
    background: isErr ? '#fef2f2' : '#f0fdf4', color: isErr ? '#dc2626' : '#15803d',
  }),
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MedicalsPage() {
  const [view, setView] = useState<'files' | 'folder'>('files');
  const [folders, setFolders] = useState<MedicalFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<MedicalFolder | null>(null);
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);

  const flash = (text: string, err = false) => {
    setMsg(text); setIsErr(err);
    setTimeout(() => setMsg(''), 4000);
  };

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getMedicalFolders();
      setFolders(res.data?.folders ?? []);
    } catch { flash('Failed to load folders', true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const openFolder = (folder: MedicalFolder) => { setActiveFolder(folder); setView('folder'); };
  const backToFiles = () => { setView('files'); setActiveFolder(null); loadFolders(); };

  if (view === 'folder' && activeFolder) {
    return <FolderView folder={activeFolder} onBack={backToFiles} flash={flash} />;
  }

  return (
    <div>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px', marginBottom: '0.35rem' }}>
        Medical Files
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.95rem', marginBottom: '2rem' }}>
        Organise your medical documents into folders.
      </p>

      {msg && <div style={{ ...S.msg(isErr), marginBottom: '1rem' }}>{msg}</div>}
      <CreateFolderCard onCreated={loadFolders} flash={flash} />
      <ExtractionFailSafeCard onDone={loadFolders} flash={flash} />

      {loading ? (
        <div style={{ color: '#9ca3af', padding: '2rem 0' }}>Loading...</div>
      ) : folders.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📁</div>
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>No folders yet</div>
          <div style={{ fontSize: '0.875rem' }}>Create your first folder above to start organising documents.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {folders.map(f => (
            <FolderCard key={f.name} folder={f} onOpen={openFolder} onDeleted={loadFolders} flash={flash} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── CreateFolderCard ──────────────────────────────────────────────────────────

function CreateFolderCard({ onCreated, flash }: { onCreated: () => void; flash: (m: string, e?: boolean) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiClient.createMedicalFolder(name.trim());
      setName(''); onCreated(); flash('Folder created');
    } catch (err: any) {
      flash(err.response?.data?.message || err.message || 'Failed to create folder', true);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ ...S.card, display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.5rem' }}>
      <div style={{ fontSize: '1.5rem' }}>📁</div>
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.625rem', flex: 1 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New folder name…" style={{ ...S.input, flex: 1 }} />
        <button type="submit" style={S.btn('primary', saving || !name.trim())} disabled={saving || !name.trim()}>
          {saving ? 'Creating…' : 'Create Folder'}
        </button>
      </form>
    </div>
  );
}

function ExtractionFailSafeCard({ onDone, flash }: { onDone: () => void; flash: (m: string, e?: boolean) => void }) {
  const [busy, setBusy] = useState(false);

  const handleExtractPending = async () => {
    setBusy(true);
    try {
      const res = await apiClient.extractPendingMedicalCsvs();
      const extracted = res.data?.extracted || {};
      const bloods = extracted.bloods || 0;
      const dna = extracted.dna || 0;
      const records = extracted.records || 0;
      const skipped = res.data?.skipped || 0;
      const retyped = res.data?.retyped || 0;
      flash(`Extraction check complete: +${bloods} bloods, +${dna} DNA, +${records} records | skipped ${skipped}${retyped ? ` | retyped ${retyped}` : ''}`);
      onDone();
    } catch (err: any) {
      flash(err?.response?.data?.message || 'Failed to extract pending medical data', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...S.card, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
      <div>
        <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>CSV Extraction Fail-safe</div>
        <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
          Extracts data from latest documents that are not yet represented in medical CSV files.
        </div>
      </div>
      <button
        type="button"
        onClick={handleExtractPending}
        disabled={busy}
        style={S.btn('outline', busy)}
      >
        {busy ? 'Extracting…' : 'Extract pending docs'}
      </button>
    </div>
  );
}

// ── FolderCard ────────────────────────────────────────────────────────────────

function FolderCard({ folder, onOpen, onDeleted, flash }: {
  folder: MedicalFolder; onOpen: (f: MedicalFolder) => void;
  onDeleted: () => void; flash: (m: string, e?: boolean) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const [busy, setBusy] = useState(false);

  const handleRename = async () => {
    if (!newName.trim() || newName === folder.name) { setRenaming(false); return; }
    setBusy(true);
    try {
      await apiClient.renameMedicalFolder(folder.name, newName.trim());
      setRenaming(false); onDeleted(); flash(`Renamed to "${newName.trim()}"`);
    } catch (err: any) {
      flash(err.response?.data?.message || 'Rename failed', true);
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete folder "${folder.name}" and all its documents? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiClient.deleteMedicalFolder(folder.name); onDeleted(); flash(`Folder "${folder.name}" deleted`);
    } catch (err: any) {
      flash(err.response?.data?.message || 'Delete failed', true);
    } finally { setBusy(false); }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return iso; }
  };

  return (
    <div
      style={{ ...S.card, cursor: 'pointer', transition: 'box-shadow .15s', marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      onClick={() => !renaming && onOpen(folder)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '2rem' }}>📂</span>
        {renaming ? (
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
            style={{ ...S.input, flex: 1 }} />
        ) : (
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', wordBreak: 'break-word' }}>{folder.name}</div>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.15rem' }}>
              {folder.documentCount} document{folder.documentCount !== 1 ? 's' : ''} · {fmtDate(folder.createdAt)}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
        {renaming ? (
          <>
            <button style={S.btn('primary', busy)} onClick={handleRename} disabled={busy}>Save</button>
            <button style={S.btn('ghost')} onClick={() => { setRenaming(false); setNewName(folder.name); }}>Cancel</button>
          </>
        ) : (
          <>
            <button style={S.btn('outline')} onClick={() => onOpen(folder)}>Open</button>
            <button style={S.btn('ghost')} onClick={() => setRenaming(true)}>Rename</button>
            <button style={S.btn('danger', busy)} onClick={handleDelete} disabled={busy}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── FolderView ────────────────────────────────────────────────────────────────

function FolderView({ folder, onBack, flash }: {
  folder: MedicalFolder; onBack: () => void; flash: (m: string, e?: boolean) => void;
}) {
  const [docs, setDocs] = useState<MedicalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [sortBy, setSortBy] = useState<'createdAt' | 'originalName'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const previewingRef = useRef(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getFolderDocuments(folder.name);
      setDocs(res.data?.documents ?? []);
    } catch { flash('Failed to load documents', true); }
    finally { setLoading(false); }
  }, [folder.name, flash]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Sort documents
  const sortedDocs = useMemo(() => {
    return [...docs].sort((a, b) => {
      const av = sortBy === 'createdAt' ? a.createdAt : a.originalName.toLowerCase();
      const bv = sortBy === 'createdAt' ? b.createdAt : b.originalName.toLowerCase();
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [docs, sortBy, sortDir]);

  // Process the upload queue sequentially
  const processQueue = useCallback(async (queue: UploadItem[]) => {
    if (processingRef.current) return;
    processingRef.current = true;
    let reloaded = false;
    for (const item of queue) {
      if (item.status !== 'pending') continue;
      setUploadQueue(q => q.map(i => i.uid === item.uid ? { ...i, status: 'uploading', progress: 0 } : i));
      try {
        const res = await apiClient.uploadToMedicalFolder(folder.name, item.file, undefined, (pct) => {
          setUploadQueue(q => q.map(i => i.uid === item.uid ? { ...i, progress: pct } : i));
        });
        const isZip = getExt(item.file.name) === '.zip';
        const zipNote = isZip && res.data?.extracted != null
          ? `${res.data.extracted} file${res.data.extracted !== 1 ? 's' : ''} extracted${res.data.skipped ? `, ${res.data.skipped} skipped` : ''}`
          : undefined;
        setUploadQueue(q => q.map(i => i.uid === item.uid ? { ...i, status: 'done', progress: 100, note: zipNote } : i));
        reloaded = false;
      } catch (err: any) {
        const status = err.response?.status;
        const errMsg = status === 413
          ? 'File too large (max 100 MB)'
          : err.response?.data?.message || err.message || 'Upload failed';
        setUploadQueue(q => q.map(i => i.uid === item.uid ? { ...i, status: 'error', error: errMsg } : i));
      }
    }
    processingRef.current = false;
    if (!reloaded) await loadDocs();
    // Auto-clear successful items after 3s
    setTimeout(() => {
      setUploadQueue(q => q.filter(i => i.status === 'error' || i.status === 'blocked' || i.status === 'awaiting_approval'));
    }, 3000);
  }, [folder.name, loadDocs]);

  const processPreviews = useCallback(async (queue: UploadItem[]) => {
    if (previewingRef.current) return;
    previewingRef.current = true;
    for (const item of queue) {
      if (item.status !== 'previewing') continue;
      try {
        const res = await apiClient.previewMedicalUploadToFolder(folder.name, item.file);
        const data = res.data;
        setUploadQueue(q => q.map(i => i.uid === item.uid ? {
          ...i,
          status: 'awaiting_approval',
          preview: {
            type: data.type,
            date: data.date,
            extractedRows: data.extractedRows,
            sampleRows: data.sampleRows ?? [],
            warning: data.warning,
          },
        } : i));
      } catch (err: any) {
        const errMsg = err?.response?.data?.message || err?.message || 'Preview extraction failed';
        setUploadQueue(q => q.map(i => i.uid === item.uid ? { ...i, status: 'error', error: errMsg } : i));
      }
    }
    previewingRef.current = false;
  }, [folder.name]);

  const queueFiles = useCallback((files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (!fileArr.length) return;

    const newItems: UploadItem[] = fileArr.map(file => {
      const ext = getExt(file.name);
      const isBlocked = BLOCKED_EXTS.includes(ext);
      const isTooLarge = file.size > MAX_FILE_BYTES;
      let status: UploadItem['status'] = 'previewing';
      let error: string | undefined;
      if (isBlocked) { status = 'blocked'; error = `${ext} archives are not supported (use ZIP instead)`; }
      else if (isTooLarge) { status = 'blocked'; error = `File too large — max ${fmtBytes(MAX_FILE_BYTES)}`; }
      return { uid: `${Date.now()}-${Math.random()}`, file, status, progress: 0, error };
    });

    setUploadQueue(prev => {
      const next = [...prev, ...newItems];
      setTimeout(() => processPreviews(next.filter(i => i.status === 'previewing')), 0);
      return next;
    });
  }, [processPreviews]);

  const approveSingle = useCallback((uid: string) => {
    setUploadQueue(prev => {
      const next = prev.map(item => item.uid === uid ? { ...item, status: 'pending' as const } : item);
      setTimeout(() => processQueue(next.filter(i => i.uid === uid && i.status === 'pending')), 0);
      return next;
    });
  }, [processQueue]);

  const removeQueuedItem = useCallback((uid: string) => {
    setUploadQueue(prev => prev.filter(item => item.uid !== uid));
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) queueFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files) queueFiles(e.dataTransfer.files);
  };

  const handleDelete = async (doc: MedicalDoc) => {
    if (!confirm(`Delete "${doc.originalName}"?`)) return;
    try {
      await apiClient.deleteMedicalDocument(doc.id);
      setDocs(d => d.filter(x => x.id !== doc.id));
      flash('Document deleted');
    } catch (err: any) { flash(err.response?.data?.message || 'Delete failed', true); }
  };

  const handleDownload = async (doc: MedicalDoc) => {
    const token = await apiClient.getToken();
    const url = apiClient.getMedicalDocumentDownloadUrl(doc.id);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl; a.download = doc.originalName;
    a.click(); URL.revokeObjectURL(objectUrl);
  };

  const toggleSort = (field: 'createdAt' | 'originalName') => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir(field === 'createdAt' ? 'desc' : 'asc'); }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return iso; }
  };

  const fileIcon = (name: string) => {
    const ext = getExt(name);
    if (ext === '.pdf') return '📄';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return '🖼️';
    if (['.doc', '.docx'].includes(ext)) return '📝';
    if (['.xls', '.xlsx', '.csv'].includes(ext)) return '📊';
    if (ext === '.zip') return '📦';
    return '📎';
  };

  const sortArrow = (field: 'createdAt' | 'originalName') => {
    if (sortBy !== field) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const hasQueue = uploadQueue.length > 0;
  const allDone = uploadQueue.every(i => i.status === 'done' || i.status === 'error' || i.status === 'blocked');
  const isUploading = uploadQueue.some(i => i.status === 'uploading' || i.status === 'pending');

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button style={{ ...S.btn('ghost'), padding: '0.5rem 0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={onBack}>
          ← Back
        </button>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📂</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{folder.name}</h1>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.2rem' }}>
            {docs.length} document{docs.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#111' : '#d1d5db'}`,
          borderRadius: '16px', padding: '2rem',
          textAlign: 'center', cursor: 'pointer',
          background: dragOver ? '#f8fafc' : '#fafafa',
          transition: 'all .15s', marginBottom: '1rem',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>{isUploading ? '⏳' : '⬆️'}</div>
        <div style={{ fontWeight: 600, color: '#374151', marginBottom: '0.2rem', fontSize: '0.95rem' }}>
          {isUploading ? 'Uploading…' : 'Drop files here or click to upload'}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
          PDF, images, Word docs, spreadsheets, ZIP archives — up to 100 MB each · extracted rows are shown for approval before save
        </div>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileInput} />
      </div>

      {/* Upload queue */}
      {hasQueue && (
        <div style={{ ...S.card, padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
              {isUploading ? 'Uploading files…' : allDone ? 'Upload complete' : 'Upload queue'}
            </span>
            {allDone && (
              <button onClick={() => setUploadQueue([])} style={{ ...S.btn('ghost'), padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
                Clear
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {uploadQueue.map(item => (
              <div key={item.uid} style={{
                padding: '0.625rem 0.875rem', borderRadius: '10px',
                background: item.status === 'error' || item.status === 'blocked' ? '#fef2f2'
                  : item.status === 'done' ? '#f0fdf4' : '#f8fafc',
                border: '1px solid',
                borderColor: item.status === 'error' || item.status === 'blocked' ? '#fecaca'
                  : item.status === 'done' ? '#bbf7d0' : '#e5e7eb',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{fileIcon(item.file.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{fmtBytes(item.file.size)}</div>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: '0.78rem', fontWeight: 600,
                    color: item.status === 'done' ? '#15803d' : item.status === 'error' || item.status === 'blocked' ? '#dc2626'
                      : item.status === 'uploading' ? '#2563eb' : item.status === 'awaiting_approval' ? '#92400e' : item.status === 'previewing' ? '#7c3aed' : '#6b7280' }}>
                    {item.status === 'done' ? '✓ Done'
                      : item.status === 'error' ? '✗ Failed'
                      : item.status === 'blocked' ? '✗ Blocked'
                      : item.status === 'previewing' ? 'Extracting preview…'
                      : item.status === 'awaiting_approval' ? 'Needs approval'
                      : item.status === 'uploading' ? `${item.progress}%`
                      : 'Waiting…'}
                  </div>
                </div>
                {item.status === 'awaiting_approval' && item.preview && (
                  <div style={{
                    marginTop: '0.55rem',
                    border: '1px solid #fde68a',
                    background: '#fffbeb',
                    borderRadius: '8px',
                    padding: '0.55rem 0.65rem',
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 700, marginBottom: '0.35rem' }}>
                      Extracted preview ({item.preview.type}) · {item.preview.extractedRows} row{item.preview.extractedRows !== 1 ? 's' : ''} · date {item.preview.date}
                    </div>
                    {item.preview.warning && (
                      <div style={{ fontSize: '0.74rem', color: '#b45309', marginBottom: '0.35rem' }}>
                        {item.preview.warning}
                      </div>
                    )}
                    {item.preview.sampleRows.length > 0 ? (
                      <pre style={{
                        margin: 0,
                        fontSize: '0.7rem',
                        lineHeight: 1.45,
                        color: '#1f2937',
                        background: '#fff',
                        border: '1px solid #f3f4f6',
                        borderRadius: '6px',
                        padding: '0.45rem',
                        maxHeight: '160px',
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}>
                        {JSON.stringify(item.preview.sampleRows, null, 2)}
                      </pre>
                    ) : (
                      <div style={{ fontSize: '0.74rem', color: '#92400e' }}>
                        No structured fields detected. You can cancel or approve to save document only.
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.45rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => removeQueuedItem(item.uid)}
                        style={{ ...S.btn('ghost'), padding: '0.32rem 0.62rem', fontSize: '0.74rem' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => approveSingle(item.uid)}
                        style={{ ...S.btn('primary'), padding: '0.32rem 0.62rem', fontSize: '0.74rem' }}
                      >
                        Approve & save
                      </button>
                    </div>
                  </div>
                )}
                {/* Progress bar */}
                {item.status === 'uploading' && (
                  <div style={{ marginTop: '0.5rem', background: '#e5e7eb', borderRadius: '99px', height: '6px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '99px', background: '#2563eb',
                      width: `${item.progress}%`, transition: 'width 0.2s ease',
                    }} />
                  </div>
                )}
                {/* Error/blocked reason */}
                {(item.status === 'error' || item.status === 'blocked') && item.error && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#dc2626' }}>{item.error}</div>
                )}
                {/* ZIP extraction note */}
                {item.status === 'done' && item.note && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#15803d' }}>📦 {item.note}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div style={{ color: '#9ca3af', padding: '2rem 0' }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: '#9ca3af', padding: '2.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
          <div style={{ fontWeight: 600 }}>No documents yet</div>
          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Upload files using the area above.</div>
        </div>
      ) : (
        <div style={S.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                {/* Sortable: File name */}
                <th
                  onClick={() => toggleSort('originalName')}
                  style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  File{sortArrow('originalName')}
                </th>
                {/* Sortable: Date Created */}
                <th
                  onClick={() => toggleSort('createdAt')}
                  style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  Date Created{sortArrow('createdAt')}
                </th>
                <th style={{ textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Source
                </th>
                <th style={{ padding: '0.6rem 0.75rem' }} />
              </tr>
            </thead>
            <tbody>
              {sortedDocs.map((doc, i) => (
                <tr key={doc.id}
                  style={{ borderBottom: i < sortedDocs.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{fileIcon(doc.originalName)}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a', wordBreak: 'break-word', maxWidth: '280px' }}>
                        {doc.originalName}
                      </div>
                      {doc.type && (
                        <span style={{ fontSize: '0.7rem', background: '#f3f4f6', color: '#6b7280', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                          {doc.type}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {fmtDate(doc.createdAt)}
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.85rem', color: '#6b7280' }}>
                    {doc.source}
                  </td>
                  <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button style={S.btn('outline')} onClick={() => handleDownload(doc)}>Download</button>
                      <button style={S.btn('danger')} onClick={() => handleDelete(doc)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
