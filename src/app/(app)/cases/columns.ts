/**
 * Which columns the case table can show.
 *
 * The set is configurable rather than fixed because what matters at a glance
 * differs by discipline — a fire investigator scans by county and days open, a
 * questioned-documents examiner may care about the incident date and nothing
 * about geography. Choices live in the URL (?cols=) so a column layout travels
 * with a shared link and can be captured in a saved view.
 */
export interface ColumnDef {
  key: string;
  label: string;
  /** Always rendered; the case number is how a row is identified. */
  pinned?: boolean;
  /** Part of the default layout. */
  standard?: boolean;
  align?: 'right';
}

export const COLUMNS: ColumnDef[] = [
  { key: 'case_number', label: 'Case', pinned: true },
  { key: 'title', label: 'Description' },
  { key: 'address', label: 'Address', standard: true },
  { key: 'city', label: 'City' },
  { key: 'county', label: 'County', standard: true },
  { key: 'state', label: 'State' },
  { key: 'case_type_name', label: 'Type', standard: true },
  { key: 'status_label', label: 'Status', standard: true },
  { key: 'days_open', label: 'Days open', standard: true, align: 'right' },
  { key: 'created_at', label: 'Created', standard: true },
  { key: 'incident_date', label: 'Incident' },
  { key: 'lead_investigator_name', label: 'Lead', standard: true },
  { key: 'created_by_name', label: 'Creator' },
];

export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.pinned || c.standard).map((c) => c.key);

/** Parse ?cols=, falling back to the standard layout. Unknown keys are dropped. */
export function resolveColumns(param: string | undefined): string[] {
  if (!param) return DEFAULT_COLUMNS;
  const known = new Set(COLUMNS.map((c) => c.key));
  const chosen = param.split(',').map((c) => c.trim()).filter((c) => known.has(c));
  if (!chosen.length) return DEFAULT_COLUMNS;
  const pinned = COLUMNS.filter((c) => c.pinned).map((c) => c.key);
  return [...new Set([...pinned, ...chosen])];
}
