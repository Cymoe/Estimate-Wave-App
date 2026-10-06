import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Copy, FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { templatesAPI } from '../lib/api';
import { MongoLineItemService as LineItemService } from '../services/MongoLineItemService';
import { formatCurrency } from '../utils/format';

export interface TemplateItem {
  lineItemId?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  items: TemplateItem[];
  total: number;
  usageCount: number;
}

interface PriceBookItem {
  id: string;
  name: string;
  description?: string;
  unit?: string;
  base_price?: number;
  price?: number;
  cost_code?: { code: string; name: string } | null;
}

const inputClass =
  'w-full bg-[#0A0A0A] border border-[#333333] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]';

const TemplateEditor: React.FC<{
  organizationId: string;
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ organizationId, template, onClose, onSaved }) => {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [items, setItems] = useState<TemplateItem[]>(template?.items ?? []);
  const [priceBook, setPriceBook] = useState<PriceBookItem[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    LineItemService.list(organizationId)
      .then((rows) => setPriceBook(rows as unknown as PriceBookItem[]))
      .catch((err) => console.error('Error loading price book:', err));
  }, [organizationId]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return priceBook
      .filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          (item.cost_code?.name ?? '').toLowerCase().includes(term),
      )
      .slice(0, 25);
  }, [priceBook, search]);

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const addFromPriceBook = (item: PriceBookItem) => {
    setItems([
      ...items,
      {
        lineItemId: item.id,
        name: item.name,
        description: item.description,
        quantity: 1,
        unitPrice: item.base_price ?? item.price ?? 0,
        unit: item.unit,
      },
    ]);
    setSearch('');
  };

  const updateItem = (index: number, changes: Partial<TemplateItem>) => {
    setItems(items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const data = { name, description: description || null, items };
      if (template) await templatesAPI.update(template.id, data);
      else await templatesAPI.create(organizationId, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <form
        onSubmit={save}
        className="relative w-full md:w-[720px] h-full bg-[#1D1F25] border-l border-[#333333] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333333]">
          <h2 className="text-lg font-semibold text-white">{template ? 'Edit template' : 'New template'}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <p className="text-sm text-red-400 border border-red-900 bg-red-950/40 px-3 py-2">{error}</p>}

          <div className="space-y-3">
            <input
              className={inputClass}
              placeholder="Template name, e.g. Bathroom refresh"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <textarea
              className={inputClass}
              placeholder="Description (optional)"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="Add from the price book: search items or cost codes"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {matches.length > 0 && (
              <div className="border border-t-0 border-[#333333] max-h-64 overflow-y-auto">
                {matches.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => addFromPriceBook(item)}
                    className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-[#262830] border-b border-[#2a2a2a] last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-white truncate">{item.name}</span>
                      <span className="block text-xs text-gray-500 truncate">{item.cost_code?.name}</span>
                    </span>
                    <span className="text-sm text-gray-300 whitespace-nowrap">
                      {formatCurrency(item.base_price ?? item.price ?? 0)}
                      {item.unit ? ` / ${item.unit}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {search.trim() && matches.length === 0 && (
              <p className="text-xs text-gray-500 mt-2">No price-book items match “{search.trim()}”.</p>
            )}
          </div>

          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center border border-dashed border-[#333333]">
                No items yet. Search the price book above, or add a custom line.
              </p>
            ) : (
              items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className={`${inputClass} col-span-6`}
                    value={item.name}
                    onChange={(e) => updateItem(index, { name: e.target.value })}
                    placeholder="Item"
                    required
                  />
                  <input
                    className={`${inputClass} col-span-2`}
                    type="number"
                    min="0.01"
                    step="any"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                    aria-label="Quantity"
                  />
                  <input
                    className={`${inputClass} col-span-3`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })}
                    aria-label="Unit price"
                  />
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                    className="col-span-1 p-2 text-gray-500 hover:text-red-400"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
            <button
              type="button"
              onClick={() => setItems([...items, { name: '', quantity: 1, unitPrice: 0 }])}
              className="inline-flex items-center gap-1 text-sm text-[#5b8fc7] hover:text-white"
            >
              <Plus className="w-4 h-4" /> Add custom line
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#333333] flex items-center justify-between">
          <span className="text-sm text-gray-400">
            {items.length} item{items.length === 1 ? '' : 's'} · <span className="text-white">{formatCurrency(total)}</span>
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-300 hover:text-white">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-[#336699] hover:bg-[#2a5580] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const Templates: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);

  const load = async () => {
    if (!organizationId) return;
    try {
      setTemplates(await templatesAPI.list(organizationId));
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const remove = async (template: Template) => {
    if (!window.confirm(`Delete the template “${template.name}”?`)) return;
    await templatesAPI.delete(template.id);
    load();
  };

  const duplicate = async (template: Template) => {
    await templatesAPI.duplicate(template.id);
    load();
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="px-6 py-5 border-b border-[#333333] bg-[#1D1F25] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Templates</h1>
          <p className="text-sm text-gray-400">Sets of items you quote often. Add one to an estimate in a click.</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#336699] hover:bg-[#2a5580]"
        >
          <Plus className="w-4 h-4" /> New template
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-sm text-gray-500">Loading templates…</p>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FileText className="w-12 h-12 mb-4 text-gray-600" />
            <h2 className="text-lg font-semibold mb-2">No templates yet</h2>
            <p className="text-sm text-gray-400 max-w-md mb-6">
              Build a template from price-book items, like “Bathroom refresh” or “Roof tear-off and replace”, then
              start estimates from it.
            </p>
            <button
              onClick={() => setEditing('new')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#336699] hover:bg-[#2a5580]"
            >
              <Plus className="w-4 h-4" /> Create your first template
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <div key={template.id} className="bg-[#1D1F25] border border-[#333333] p-4 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-white">{template.name}</h3>
                  <span className="text-white font-semibold whitespace-nowrap">{formatCurrency(template.total)}</span>
                </div>
                {template.description && <p className="text-sm text-gray-400 mt-1">{template.description}</p>}
                <ul className="mt-3 space-y-1 text-sm text-gray-300 flex-1">
                  {template.items.slice(0, 4).map((item, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{item.name}</span>
                      <span className="text-gray-500 whitespace-nowrap">× {item.quantity}</span>
                    </li>
                  ))}
                  {template.items.length > 4 && (
                    <li className="text-gray-500">and {template.items.length - 4} more</li>
                  )}
                </ul>
                <div className="mt-4 pt-3 border-t border-[#333333] flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {template.usageCount > 0
                      ? `Used ${template.usageCount} time${template.usageCount === 1 ? '' : 's'}`
                      : 'Not used yet'}
                  </span>
                  <span className="flex gap-1">
                    <button onClick={() => setEditing(template)} className="p-1.5 hover:text-white" aria-label="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => duplicate(template)} className="p-1.5 hover:text-white" aria-label="Duplicate">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(template)} className="p-1.5 hover:text-red-400" aria-label="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && organizationId && (
        <TemplateEditor
          organizationId={organizationId}
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
};

export default Templates;
