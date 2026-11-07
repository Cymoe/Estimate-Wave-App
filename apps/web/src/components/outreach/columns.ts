// The table's columns a company can hide from the Columns picker. The
// checkbox and the name always stay; the choice is kept in the browser.
export type ColumnKey = 'person' | 'phone' | 'email' | 'research' | 'status' | 'mailing' | 'property' | 'value' | 'type' | 'signals';
export const COLUMNS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'person', label: 'Decision maker' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'research', label: 'Research' },
  { key: 'status', label: 'Status' },
  { key: 'mailing', label: 'Mailing address' },
  { key: 'property', label: 'Property' },
  { key: 'value', label: 'Value' },
  { key: 'type', label: 'Type' },
  { key: 'signals', label: 'Signals' },
];
const KEY = 'outreach.columns';
const keys = new Set<string>(COLUMNS.map((c) => c.key));

/** The columns hidden last time, if the browser kept them. */
export const readHiddenColumns = (): Set<ColumnKey> => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((k): k is ColumnKey => typeof k === 'string' && keys.has(k)) : []);
  } catch {
    return new Set();
  }
};
export const writeHiddenColumns = (hidden: Set<ColumnKey>) => {
  try {
    if (hidden.size === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify([...hidden]));
  } catch {
    // A private window: the choice lasts the page.
  }
};
