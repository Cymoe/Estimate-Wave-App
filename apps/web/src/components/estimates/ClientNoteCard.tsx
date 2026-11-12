import React, { useEffect, useState } from 'react';
import { EstimateService, type Estimate } from '../../services/EstimateService';

/**
 * The note at the top of the client's link ("Hi {first name}, thanks for
 * having us out…"). New estimates start with the company's note; it saves
 * when the box loses focus.
 */
export const ClientNoteCard: React.FC<{ estimateId: string; note?: string; onSaved: (estimate: Estimate) => void }> = ({
  estimateId,
  note,
  onSaved,
}) => {
  const [draft, setDraft] = useState(note ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  useEffect(() => setDraft(note ?? ''), [note]);

  const save = async () => {
    if (draft.trim() === (note ?? '').trim()) return;
    setState('saving');
    try {
      onSaved(await EstimateService.update(estimateId, { client_message: draft.trim() }));
      setState('saved');
    } catch (err) {
      console.error('Error saving the note to the client:', err);
      setState('failed');
    }
  };

  return (
    <div className="px-4 py-5" data-testid="client-note">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Note to the client</h3>
        <span className="text-xs text-gray-500" aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setState('idle');
        }}
        onBlur={save}
        rows={3}
        placeholder="Hi {first name}, thanks for having us out. Here's everything we talked about."
        aria-label="Note to the client"
        className="w-full bg-[#121212] border border-[#333] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#336699]"
      />
      <p className="text-xs text-gray-500 mt-1">
        {state === 'failed'
          ? "Couldn't save the note. Check your connection and tap outside the box to try again."
          : 'Shown at the top of their estimate. {first name} becomes the client’s first name.'}
      </p>
    </div>
  );
};
