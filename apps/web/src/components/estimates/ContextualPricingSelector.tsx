import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Minus, Package } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { MongoLineItemService as LineItemService } from '../../services/MongoLineItemService';
import { IndustryService } from '../../services/IndustryService';
import { priceRange } from '../../utils/priceRange';
import { ServiceCatalogService } from '../../services/ServiceCatalogService';

interface LineItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  base_price?: number;
  red_line_price?: number;
  cap_price?: number;
  unit: string;
  cost_code_id?: string;
  industry_id?: string;
  category?: string;
  cost_code?: { name?: string; code?: string; industry_id?: string } | null;
}

interface SelectedItem {
  lineItemId: string;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  description?: string;
  red_line_price?: number;
  cap_price?: number;
}

interface ProjectContext {
  projectType?: string;
  packageLevel?: string;
  packageId?: string;
  industryId?: string;
  includedCategories?: string[];
}

interface ContextualPricingSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItems: (items: SelectedItem[]) => void;
  organizationId: string;
  projectContext?: ProjectContext;
  existingItems?: SelectedItem[];
}

const ALL = 'all';
const OTHER = 'Other';

/** The trade an item belongs to (its cost code's industry), for the left column. */
const tradeOf = (item: LineItem, names: Map<string, string>) => {
  const slug = item.cost_code?.industry_id ?? item.industry_id;
  return (slug && names.get(slug)) || OTHER;
};
/** The cost code heading an item sits under. */
const codeOf = (item: LineItem) =>
  item.cost_code?.name ? [item.cost_code.code, item.cost_code.name].filter(Boolean).join(' · ') : 'Other items';

const matches = (item: LineItem, search: string) =>
  !search || item.name.toLowerCase().includes(search) || (item.description ?? '').toLowerCase().includes(search);

/**
 * Adds Price Book items to an estimate. It opens as a drawer over the
 * estimate, as wide as it, with the trades in the same left column the
 * estimate keeps its pricing options in, and the items as rows like the
 * estimate's own: tap + to add one, then set how many. Items come in at
 * their cap price, keeping their red line and cap.
 */
export const ContextualPricingSelector: React.FC<ContextualPricingSelectorProps> = ({
  isOpen,
  onClose,
  onAddItems,
  organizationId,
  projectContext,
  existingItems = [],
}) => {
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [tradeNames, setTradeNames] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [trade, setTrade] = useState<string>(ALL);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [packageItems, setPackageItems] = useState<LineItem[]>([]);
  const [visible, setVisible] = useState(false);

  // Items already chosen (when reopened with a selection).
  useEffect(() => {
    if (existingItems.length > 0) {
      const itemsMap = new Map<string, SelectedItem>();
      existingItems.forEach((item) => itemsMap.set(item.lineItemId, item));
      setSelectedItems(itemsMap);
    }
  }, [existingItems]);

  useEffect(() => {
    loadContextualItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, projectContext]);

  // Slides in like the estimate's other drawers; Esc closes it.
  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const loadContextualItems = async () => {
    if (!organizationId) return;
    setIsLoading(true);
    try {
      const [rows, industries] = await Promise.all([
        LineItemService.list(organizationId),
        IndustryService.listAll().catch(() => []),
      ]);
      setTradeNames(new Map((industries as Array<{ id: string; name: string }>).map((i) => [i.id, i.name])));
      // Items are offered at their cap price, the starting point for an estimate.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let filteredItems = rows.map((item: any) => {
        const range = priceRange(item);
        return { ...item, red_line_price: range.redLine, cap_price: range.cap, price: range.cap } as LineItem;
      });

      if (projectContext) {
        if (projectContext.industryId) {
          filteredItems = filteredItems.filter((item) => item.industry_id === projectContext.industryId);
        }
        if (projectContext.includedCategories && projectContext.includedCategories.length > 0) {
          filteredItems = filteredItems.filter((item) => item.category && projectContext.includedCategories!.includes(item.category));
        }
        if (projectContext.packageId) {
          try {
            const packageData = await ServiceCatalogService.getPackageWithItems(projectContext.packageId);
            if (packageData && packageData.items) {
              const packageLineItems: LineItem[] = [];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              packageData.items.forEach((packageItem: any) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                packageItem.service_option?.items?.forEach((serviceItem: any) => {
                  if (serviceItem.line_item) packageLineItems.push({ ...serviceItem.line_item, quantity: serviceItem.quantity || 1 });
                });
              });
              setPackageItems(packageLineItems);
            }
          } catch (error) {
            console.error('Error loading package items:', error);
          }
        }
      }
      setLineItems(filteredItems);
    } catch (error) {
      console.error('Error loading line items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const search = searchTerm.trim().toLowerCase();
  const searched = useMemo(() => lineItems.filter((item) => matches(item, search)), [lineItems, search]);

  // The trades in the left column, with how many items each has (after the search).
  const trades = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of searched) {
      const t = tradeOf(item, tradeNames);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)));
  }, [searched, tradeNames]);

  // The items shown, grouped under their cost code.
  const groups = useMemo(() => {
    const shown = trade === ALL ? searched : searched.filter((item) => tradeOf(item, tradeNames) === trade);
    const byCode = new Map<string, LineItem[]>();
    for (const item of shown) {
      const key = trade === ALL ? `${tradeOf(item, tradeNames)} · ${codeOf(item)}` : codeOf(item);
      byCode.set(key, [...(byCode.get(key) ?? []), item]);
    }
    // By trade, then cost code, with the unsorted ones last.
    const last = (key: string) => key.startsWith(OTHER) || key.endsWith('Other items');
    return [...byCode.entries()].sort(([a], [b]) => (last(a) === last(b) ? a.localeCompare(b) : last(a) ? 1 : -1));
  }, [searched, trade, tradeNames]);

  const add = (item: LineItem) => {
    const next = new Map(selectedItems);
    next.set(item.id, {
      lineItemId: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
      unit: item.unit,
      description: item.description,
      red_line_price: item.red_line_price,
      cap_price: item.cap_price,
    });
    setSelectedItems(next);
  };
  const updateQuantity = (itemId: string, quantity: number) => {
    const next = new Map(selectedItems);
    const item = next.get(itemId);
    if (quantity <= 0) next.delete(itemId);
    else if (item) next.set(itemId, { ...item, quantity });
    setSelectedItems(next);
  };

  const chosen = Array.from(selectedItems.values());
  const total = chosen.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const handleAddItems = () => {
    onAddItems(chosen);
    onClose();
  };
  const isPackageItem = (itemId: string) => packageItems.some((pi) => pi.id === itemId);

  if (!isOpen) return null;

  const tradeButton = (value: string, label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setTrade(value)}
      aria-pressed={trade === value}
      className={`w-full px-3 py-1.5 flex items-center justify-between gap-2 text-left text-[13px] transition-colors ${
        trade === value ? 'bg-[#336699] text-white' : 'text-gray-300 hover:bg-[#22272d] hover:text-white'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`text-[11px] ${trade === value ? 'text-white/80' : 'text-gray-500'}`}>{count}</span>
    </button>
  );

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10002] ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Add items to estimate"
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[720px] max-w-full bg-[#121212] border-l border-[#333333] shadow-xl transform transition-transform z-[10003] flex flex-col ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header: close on the left, Add alone on the right, like the item drawer */}
        <div className="flex items-start gap-3 px-4 py-4 border-b border-[#333333] flex-shrink-0">
          <button onClick={onClose} className="p-1 -ml-1 mt-0.5 text-gray-400 hover:text-white flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-white">Add items</h2>
            <p className="text-xs text-gray-400 mt-1">
              {projectContext?.projectType ? `${projectContext.projectType} · ` : ''}From your Price Book, at cap price. Adjust each one on the estimate.
            </p>
          </div>
          <button
            onClick={handleAddItems}
            disabled={chosen.length === 0}
            className="px-4 py-2 text-sm text-white bg-[#336699] hover:bg-[#2a5580] disabled:bg-[#333333] disabled:text-gray-500 flex-shrink-0"
          >
            {chosen.length === 0 ? 'Add' : `Add ${chosen.length}`}
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#333333] flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search items"
              aria-label="Search items"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-[#0A0A0A] border border-[#333333] text-base md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Trades: the same column, in the same place, as the estimate's pricing options */}
          <div
            className="sm:w-[168px] flex-shrink-0 bg-[#0A0A0A] border-b sm:border-b-0 sm:border-r border-[#333333] py-1 flex sm:block overflow-x-auto sm:overflow-y-auto"
            role="group"
            aria-label="Trades"
          >
            <div className="flex sm:block min-w-max sm:min-w-0">
              {tradeButton(ALL, 'All items', searched.length)}
              {trades.map(([name, count]) => tradeButton(name, name, count))}
            </div>
          </div>

          {/* Items, as rows under their cost code */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto" data-testid="item-rows">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#336699]" />
                </div>
              ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
                  <Package className="w-8 h-8 mb-2 opacity-50" />
                  {search ? `Nothing matches “${searchTerm.trim()}”` : 'No items in your Price Book yet'}
                </div>
              ) : (
                groups.map(([heading, items]) => (
                  <section key={heading} aria-label={heading}>
                    <h3 className="sticky top-0 z-10 bg-[#121212] px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wide text-gray-500 border-b border-[#262626]">
                      {heading}
                    </h3>
                    <ul className="divide-y divide-[#262626]">
                      {items.map((item) => {
                        const picked = selectedItems.get(item.id);
                        return (
                          <li
                            key={item.id}
                            className={`flex items-center gap-3 px-4 py-2.5 border-l-2 ${picked ? 'border-[#336699] bg-[#336699]/10' : 'border-transparent'}`}
                            data-testid="item-row"
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm text-white truncate">{item.name}</span>
                              {item.description && <span className="block text-xs text-gray-500 truncate">{item.description}</span>}
                              {isPackageItem(item.id) && (
                                <span className="text-[11px] text-[#7fb0e0] flex items-center gap-1 mt-0.5">
                                  <Package className="w-3 h-3" />
                                  In this package
                                </span>
                              )}
                            </span>
                            <span className="text-right flex-shrink-0">
                              <span className="block font-mono text-sm text-gray-200">{formatCurrency(item.price)}</span>
                              <span className="block text-[11px] text-gray-500">per {item.unit || 'each'}</span>
                            </span>
                            {picked ? (
                              <span className="flex items-center border border-[#333333] flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.id, picked.quantity - 1)}
                                  className="p-2 text-gray-300 hover:bg-[#1E1E1E]"
                                  aria-label={`Fewer ${item.name}`}
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-8 text-center text-sm text-white" aria-label={`${item.name} quantity`}>
                                  {picked.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.id, picked.quantity + 1)}
                                  className="p-2 text-gray-300 hover:bg-[#1E1E1E]"
                                  aria-label={`More ${item.name}`}
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => add(item)}
                                className="w-9 h-9 flex items-center justify-center border border-[#333333] text-gray-300 hover:bg-[#1E1E1E] hover:text-white flex-shrink-0"
                                aria-label={`Add ${item.name}`}
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))
              )}
            </div>

            {/* Footer: what's chosen so far */}
            <div className="border-t border-[#333333] px-4 py-4 flex items-center justify-between flex-shrink-0 text-sm text-gray-400" data-testid="picker-total">
              <span>{chosen.length === 0 ? 'Nothing chosen yet' : `${chosen.length} item${chosen.length === 1 ? '' : 's'}`}</span>
              <span className="font-mono text-white">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
