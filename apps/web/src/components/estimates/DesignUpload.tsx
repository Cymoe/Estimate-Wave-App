import React, { useState, useRef } from 'react';
import { FileImage, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { EstimateService } from '../../services/EstimateService';

const MAX_BYTES = 10 * 1024 * 1024;

interface DesignUploadProps {
  estimateId: string;
  /** The design already attached, if any. */
  design?: { url: string; name: string; type?: string };
  /** Called after a design is attached or removed, so the estimate can reload. */
  onChange: () => void;
}

const isPdf = (file: { type?: string; name: string }) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

/** The estimate's agreed design (an image or PDF), shown on the contract. */
export const DesignUpload: React.FC<DesignUploadProps> = ({ estimateId, design, onChange }) => {
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError(null);
    if (!(file.type.startsWith('image/') || isPdf(file))) {
      setError('Choose an image (PNG, JPG) or a PDF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is over 10MB.');
      return;
    }
    setBusy('uploading');
    try {
      await EstimateService.uploadDesign(estimateId, file);
      onChange();
    } catch (err) {
      console.error('Error uploading design:', err);
      setError("The design couldn't be uploaded. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setError(null);
    setBusy('removing');
    try {
      await EstimateService.removeDesign(estimateId);
      onChange();
    } catch (err) {
      console.error('Error removing design:', err);
      setError("The design couldn't be removed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,application/pdf"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) upload(file);
      }}
      className="hidden"
      data-testid="design-file"
    />
  );
  const errorText = error && <p className="text-xs text-red-400 mt-2">{error}</p>;

  if (design) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4">
        {fileInput}
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Agreed Design</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-[#2a2a2a] rounded disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy === 'uploading' ? 'animate-spin' : ''}`} />
              Replace
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          </div>
        </div>
        {isPdf(design) ? (
          <a
            href={design.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 p-3 border border-[#333] rounded hover:bg-[#222] text-sm text-white"
          >
            <FileText className="w-6 h-6 text-gray-400 flex-shrink-0" />
            <span className="truncate">{design.name}</span>
          </a>
        ) : (
          <a href={design.url} target="_blank" rel="noreferrer">
            <img
              src={design.url}
              alt={design.name}
              className="w-full max-h-72 object-contain rounded border border-[#333] bg-black"
            />
          </a>
        )}
        <p className="text-xs text-gray-500 mt-2">Included in the contract under "Agreed Design".</p>
        {errorText}
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Agreed Design</h3>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
          dragOver ? 'border-blue-400 bg-blue-400/10' : 'border-[#444444] hover:border-[#555555]'
        }`}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
      >
        {fileInput}
        {busy === 'uploading' ? (
          <div className="space-y-2">
            <div className="animate-spin mx-auto w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full"></div>
            <p className="text-sm text-gray-300">Uploading design...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <FileImage size={32} className="mx-auto text-gray-400" />
            <div className="space-y-1">
              <p className="text-sm text-white">Drop your ArcSite design here or</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-400 hover:text-blue-300 text-sm font-medium"
              >
                browse files
              </button>
            </div>
            <p className="text-xs text-gray-500">PNG, JPG, PDF up to 10MB · included in the contract</p>
          </div>
        )}
      </div>
      {errorText}
    </div>
  );
};
