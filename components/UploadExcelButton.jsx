'use client';
import { useRef, useState } from 'react';

export default function UploadExcelButton({ onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handlePick = () => inputRef.current?.click();

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(()=>({}))).message || 'Upload failed');
      onUploaded?.();
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleChange} />
      <button onClick={handlePick} disabled={busy} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #222', cursor: 'pointer' }}>
        {busy ? 'Uploading…' : 'Upload Excel'}
      </button>
    </div>
  );
}
