import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { photosAPI, type JobPhoto } from '../../lib/api';
import { uploadFile } from '../../services/uploads';
import { askConfirm } from './appDialogs';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const isPdf = (file: { contentType?: string; fileName: string }) =>
  file.contentType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf');

/** One photo full screen, with its caption, the ones either side, and Delete. */
const Viewer: React.FC<{
  photos: JobPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onCaption: (photo: JobPhoto, caption: string) => void;
  onDelete: (photo: JobPhoto) => void;
}> = ({ photos, index, onIndex, onClose, onCaption, onDelete }) => {
  const photo = photos[index];
  const [caption, setCaption] = useState(photo.caption ?? '');
  useEffect(() => setCaption(photo.caption ?? ''), [photo]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return createPortal(
    <div className="fixed inset-0 z-[10010] bg-black/95 flex flex-col" role="dialog" aria-label="Photo">
      <div className="flex items-center justify-between px-4 py-3 text-sm text-gray-300">
        <span>
          {index + 1} of {photos.length} · {day(photo.createdAt)}
          {photo.from ? ` · from ${photo.from}` : ''}
        </span>
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => onDelete(photo)} className="p-2 hover:text-red-300" aria-label="Delete photo">
            <Trash2 className="w-5 h-5" />
          </button>
          <button type="button" onClick={onClose} className="p-2 hover:text-white" aria-label="Close photo">
            <X className="w-5 h-5" />
          </button>
        </span>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 relative">
        {index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} className="absolute left-2 p-3 text-gray-300 hover:text-white" aria-label="Previous photo">
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}
        <img src={photo.url} alt={photo.caption || photo.fileName} className="max-h-full max-w-full object-contain" />
        {index < photos.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} className="absolute right-2 p-3 text-gray-300 hover:text-white" aria-label="Next photo">
            <ChevronRight className="w-7 h-7" />
          </button>
        )}
      </div>
      <div className="px-4 py-3">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption !== (photo.caption ?? '') && onCaption(photo, caption)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="Add a caption"
          aria-label="Caption"
          className="w-full bg-transparent border-b border-[#333] py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#336699]"
        />
      </div>
    </div>,
    document.body,
  );
};

/** The square switch under a file: on, it goes on the contract. */
const InContract: React.FC<{ on: boolean; disabled?: boolean; title?: string; onChange?: (on: boolean) => void; name: string }> = ({
  on,
  disabled,
  title,
  onChange,
  name,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={`${name} in contract`}
    title={title}
    disabled={disabled}
    onClick={() => onChange?.(!on)}
    className={`mt-1.5 w-full flex items-center gap-1.5 text-xs text-left disabled:cursor-default ${on ? 'text-white' : 'text-gray-500'} ${disabled ? '' : 'hover:text-white'}`}
  >
    <span className={`w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center border ${on ? 'bg-[#336699] border-[#336699]' : 'border-[#555555]'}`} aria-hidden="true">
      {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </span>
    In contract
  </button>
);

/**
 * Job photos on an estimate or a project: a strip of thumbnails, Add
 * photos (the camera or the library on a phone or iPad), and a full-screen
 * viewer with captions.
 *
 * As an estimate's Files (`files`), it takes PDFs too, and each file has an
 * In contract switch: switched on, the file goes on the agreement the
 * client signs. The estimate's agreed design from before the switch shows
 * first, always on the contract.
 */
export const JobPhotos: React.FC<{
  organizationId: string;
  estimateId?: string;
  projectId?: string;
  title?: string;
  /** Inside another section: no box of its own, a plain sub-heading. */
  bare?: boolean;
  /** An estimate's Files: photos and PDFs, each with an In contract switch. */
  files?: boolean;
  /** The contract is signed: the switches stay as they were. */
  locked?: boolean;
  /** The agreed design attached before files could be marked In contract. */
  legacyDesign?: { url: string; name: string; type?: string };
  onRemoveLegacyDesign?: () => Promise<void>;
  /** Called after a file goes on or off the contract, so the agreement can refresh. */
  onContractChange?: () => void;
}> = ({
  organizationId,
  estimateId,
  projectId,
  title = 'Photos',
  bare = false,
  files = false,
  locked = false,
  legacyDesign,
  onRemoveLegacyDesign,
  onContractChange,
}) => {
  const [photos, setPhotos] = useState<JobPhoto[] | null>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const noun = files ? 'file' : 'photo';

  const load = useCallback(async () => {
    try {
      setPhotos(await photosAPI.list({ estimateId, projectId }));
    } catch (err) {
      setNote(errorText(err));
      setPhotos([]);
    }
  }, [estimateId, projectId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (picked: FileList | null) => {
    const list = Array.from(picked ?? []);
    if (list.length === 0) return;
    setNote(null);
    setUploading(list.length);
    let failed = 0;
    for (const file of list) {
      try {
        const storageId = await uploadFile(await photosAPI.uploadUrl(organizationId), file);
        await photosAPI.add({ storageId, fileName: file.name, estimateId, projectId });
      } catch (err) {
        failed += 1;
        setNote(errorText(err));
      }
      setUploading((n) => n - 1);
    }
    if (failed === 0) setNote(`${list.length} ${noun}${list.length === 1 ? '' : 's'} added.`);
    await load();
  };

  const remove = async (photo: JobPhoto) => {
    if (!(await askConfirm({ title: `Delete this ${noun}?`, confirmLabel: 'Delete' }))) return;
    try {
      await photosAPI.remove(photo.id);
      setViewing(null);
      await load();
      if (photo.inContract) onContractChange?.();
    } catch (err) {
      setNote(errorText(err));
    }
  };

  // The switch moves at once and goes back if saving fails.
  const setInContract = async (photo: JobPhoto, on: boolean) => {
    setPhotos((rows) => rows && rows.map((p) => (p.id === photo.id ? { ...p, inContract: on } : p)));
    try {
      await photosAPI.setInContract(photo.id, on);
      onContractChange?.();
    } catch (err) {
      setPhotos((rows) => rows && rows.map((p) => (p.id === photo.id ? { ...p, inContract: !on } : p)));
      setNote(errorText(err));
    }
  };

  const removeLegacy = async () => {
    if (!onRemoveLegacyDesign) return;
    if (!(await askConfirm({ title: 'Remove the agreed design?', message: 'It comes off the estimate and the contract.', confirmLabel: 'Remove' }))) return;
    try {
      await onRemoveLegacyDesign();
    } catch (err) {
      setNote(errorText(err));
    }
  };

  // The viewer pages through the pictures; a PDF opens on its own.
  const images = (photos ?? []).filter((p) => !isPdf(p));
  const lockedTitle = locked ? 'The contract is signed, so its files stay as they were signed.' : undefined;
  const empty = photos !== null && photos.length === 0 && !legacyDesign;
  const count = (photos?.length ?? 0) + (legacyDesign ? 1 : 0);

  const addButton = (
    <button
      type="button"
      onClick={() => picker.current?.click()}
      disabled={uploading > 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-200 bg-[#1E1E1E] border border-[#333] hover:bg-[#2a2a2a] disabled:opacity-50"
    >
      {files ? <Plus className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
      {uploading > 0 ? `Adding ${uploading}…` : files ? 'Add files' : 'Add photos'}
    </button>
  );

  return (
    <section className={bare || files ? '' : 'bg-[#1a1a1a] border border-[#333] p-4'} aria-label={title} data-testid="job-photos">
      <div className={`flex items-center justify-between gap-3 ${bare || files ? 'mb-3' : 'mb-3'}`}>
        <h3
          className={
            files
              ? 'text-xs font-medium text-gray-400 uppercase tracking-wider'
              : bare
                ? 'text-sm text-gray-300'
                : 'text-xs font-medium text-gray-400 uppercase tracking-wide'
          }
        >
          {title}
          {count > 0 && <span className="ml-1.5 text-gray-500">{count}</span>}
        </h3>
        {addButton}
        <input
          ref={picker}
          type="file"
          accept={files ? 'image/*,application/pdf' : 'image/*'}
          multiple
          className="hidden"
          data-testid="photo-file"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {photos === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : empty ? (
        files ? (
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="w-full flex items-center gap-3 p-4 border border-dashed border-[#444444] hover:border-[#555555] text-left"
          >
            <ImageIcon className="w-6 h-6 flex-shrink-0 text-gray-500" />
            <span className="text-sm text-gray-400">
              Photos, designs or plans. Mark any file <span className="text-white">In contract</span> to attach it to the agreement.
            </span>
          </button>
        ) : (
          <p className="text-sm text-gray-500">No photos yet. Before and after shots, progress, what the client showed you.</p>
        )
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {files && legacyDesign && (
            <li data-testid="legacy-design">
              <a
                href={legacyDesign.url}
                target="_blank"
                rel="noreferrer"
                className="block w-full aspect-square bg-[#0A0A0A] border border-[#333333] overflow-hidden"
                aria-label={legacyDesign.name}
              >
                {legacyDesign.type === 'application/pdf' || legacyDesign.name.toLowerCase().endsWith('.pdf') ? (
                  <span className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center">
                    <FileText className="w-6 h-6 text-gray-400" />
                    <span className="text-xs text-gray-300 break-all line-clamp-2">{legacyDesign.name}</span>
                  </span>
                ) : (
                  <img src={legacyDesign.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                )}
              </a>
              <div className="flex items-center justify-between gap-1">
                <InContract on disabled name={legacyDesign.name} title="The agreed design always goes on the contract" />
                {!locked && onRemoveLegacyDesign && (
                  <button type="button" onClick={removeLegacy} className="mt-1.5 p-0.5 text-gray-500 hover:text-red-300" aria-label="Remove the agreed design">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          )}
          {photos.map((photo) => (
            <li key={photo.id}>
              {isPdf(photo) ? (
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full aspect-square bg-[#0A0A0A] border border-[#333333] overflow-hidden"
                  aria-label={photo.fileName}
                >
                  <span className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center">
                    <FileText className="w-6 h-6 text-gray-400" />
                    <span className="text-xs text-gray-300 break-all line-clamp-2">{photo.fileName}</span>
                  </span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setViewing(images.findIndex((p) => p.id === photo.id))}
                  className="block w-full aspect-square bg-[#0A0A0A] overflow-hidden"
                  aria-label={photo.caption || photo.fileName}
                >
                  {photo.url && <img src={photo.url} alt="" loading="lazy" className="w-full h-full object-cover" />}
                </button>
              )}
              {files && (
                <div className="flex items-center justify-between gap-1">
                  <InContract
                    on={!!photo.inContract}
                    disabled={locked}
                    title={lockedTitle}
                    name={photo.fileName}
                    onChange={(on) => setInContract(photo, on)}
                  />
                  {isPdf(photo) && (
                    <button type="button" onClick={() => remove(photo)} className="mt-1.5 p-0.5 text-gray-500 hover:text-red-300" aria-label={`Delete ${photo.fileName}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {files && locked && count > 0 && <p className="mt-3 text-xs text-gray-500">Signed: the files marked In contract went out with the agreement.</p>}
      {note && (
        <p role="status" className="mt-3 text-xs text-gray-400">
          {note}
        </p>
      )}
      {viewing !== null && images[viewing] && (
        <Viewer
          photos={images}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onDelete={remove}
          onCaption={async (photo, caption) => {
            try {
              await photosAPI.setCaption(photo.id, caption);
              await load();
            } catch (err) {
              setNote(errorText(err));
            }
          }}
        />
      )}
    </section>
  );
};
