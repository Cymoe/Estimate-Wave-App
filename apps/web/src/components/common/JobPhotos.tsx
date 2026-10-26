import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { photosAPI, type JobPhoto } from '../../lib/api';
import { uploadFile } from '../../services/uploads';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

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

/**
 * Job photos on an estimate or a project: a strip of thumbnails, Add
 * photos (the camera or the library on a phone or iPad), and a full-screen
 * viewer with captions.
 */
export const JobPhotos: React.FC<{ organizationId: string; estimateId?: string; projectId?: string; title?: string }> = ({
  organizationId,
  estimateId,
  projectId,
  title = 'Photos',
}) => {
  const [photos, setPhotos] = useState<JobPhoto[] | null>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

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

  const add = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
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
    if (failed === 0) setNote(`${list.length} photo${list.length === 1 ? '' : 's'} added.`);
    await load();
  };

  const remove = async (photo: JobPhoto) => {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await photosAPI.remove(photo.id);
      setViewing(null);
      await load();
    } catch (err) {
      setNote(errorText(err));
    }
  };

  return (
    <section className="bg-[#1a1a1a] border border-[#333] p-4" aria-label={title} data-testid="job-photos">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {title}
          {photos && photos.length > 0 && <span className="ml-1.5 text-gray-500">{photos.length}</span>}
        </h3>
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={uploading > 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-200 bg-[#1E1E1E] border border-[#333] hover:bg-[#2a2a2a] disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />
          {uploading > 0 ? `Adding ${uploading}…` : 'Add photos'}
        </button>
        <input ref={picker} type="file" accept="image/*" multiple className="hidden" data-testid="photo-file" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {photos === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos yet. Before and after shots, progress, what the client showed you.</p>
      ) : (
        <ul className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              <button type="button" onClick={() => setViewing(i)} className="block w-full aspect-square bg-[#0A0A0A] overflow-hidden" aria-label={photo.caption || photo.fileName}>
                {photo.url && <img src={photo.url} alt="" loading="lazy" className="w-full h-full object-cover" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p role="status" className="mt-3 text-xs text-gray-400">
          {note}
        </p>
      )}
      {viewing !== null && photos && photos[viewing] && (
        <Viewer
          photos={photos}
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
