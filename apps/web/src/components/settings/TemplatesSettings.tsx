import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { templatesAPI, type ProjectTemplate } from '../../lib/api';
import { formatCurrency } from '../../utils/format';
import { InlineNotice } from '../common/Notice';
import { templateSummary } from '../../lib/templates';

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'That didn’t work');

/**
 * The company's project templates: jobs saved from a project, each with the
 * estimate's lines, the tasks and how long it takes. They're made from a
 * project (its ⋯ menu); here they can be renamed or removed.
 */
export const TemplatesSettings: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await templatesAPI.list(organizationId));
    } catch (err) {
      setNote(`Your templates couldn't be loaded: ${errorText(err)}`);
    }
  }, [organizationId]);
  useEffect(() => {
    load();
  }, [load]);

  const rename = async (t: ProjectTemplate) => {
    const name = window.prompt('Template name', t.name);
    if (!name?.trim() || name.trim() === t.name) return;
    try {
      const saved = await templatesAPI.update(t.id, { name: name.trim() });
      setTemplates((list) => list?.map((x) => (x.id === t.id ? saved : x)) ?? null);
    } catch (err) {
      setNote(errorText(err));
    }
  };

  const remove = async (t: ProjectTemplate) => {
    if (!window.confirm(`Remove “${t.name}”? Projects already started from it aren't changed.`)) return;
    try {
      await templatesAPI.remove(t.id);
      setTemplates((list) => list?.filter((x) => x.id !== t.id) ?? null);
    } catch (err) {
      setNote(errorText(err));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        A template is a job you&rsquo;ve done, kept for the next one like it: the estimate&rsquo;s lines, the tasks and how long it takes. Open any
        project, choose <span className="text-gray-200">Save as template</span> from its ⋯ menu, and it shows up under Template when you start a
        project.
      </p>
      {note && <InlineNotice tone="bad">{note}</InlineNotice>}
      {templates === null ? (
        <div className="h-16 bg-[#121212] border border-[#333] animate-pulse" />
      ) : templates.length === 0 ? (
        <div className="px-4 py-8 border border-dashed border-[#333] text-center text-sm text-gray-500">
          No templates yet.{' '}
          <Link to="/projects" className="text-[#5b8fc7] hover:underline">
            Open a finished project
          </Link>{' '}
          and save it as one.
        </div>
      ) : (
        <ul className="bg-[#121212] border border-[#333] divide-y divide-[#262626]" aria-label="Templates">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm text-white truncate">{t.name}</span>
                  {t.category && <span className="text-xs text-gray-500 truncate">{t.category}</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {templateSummary(t)}
                  {t.usageCount > 0 ? ` · used ${t.usageCount} time${t.usageCount === 1 ? '' : 's'}` : ''}
                </div>
              </div>
              <span className="font-mono tabular-nums text-sm text-gray-200">{t.total > 0 ? formatCurrency(t.total) : '—'}</span>
              <button type="button" onClick={() => rename(t)} className="p-1.5 text-gray-500 hover:text-white" aria-label={`Rename ${t.name}`}>
                <Pencil className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => remove(t)} className="p-1.5 text-gray-500 hover:text-red-400" aria-label={`Remove ${t.name}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
