import React, { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { assistantChatUrl } from '../lib/assistantLinks';
import { goTo } from '../lib/goTo';

/**
 * /open/:app/:leadId, from a lead alert: opens a new Claude or ChatGPT chat
 * asking about the lead. The question is written here, not in the alert,
 * so it can change without old texts going stale. Any other app opens the
 * lead in Tolliver instead.
 */
export default function OpenInAssistant() {
  const { app, leadId = '' } = useParams();
  const url = assistantChatUrl(app, leadId);
  useEffect(() => {
    if (url) goTo(url);
  }, [url]);
  if (!url) return <Navigate to={`/leads?lead=${encodeURIComponent(leadId)}`} replace />;
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <p className="text-sm text-gray-400">
        Opening {app === 'claude' ? 'Claude' : 'ChatGPT'}… <a href={url} className="text-[#6699CC] underline">Tap here</a> if nothing happens.
      </p>
    </div>
  );
}
