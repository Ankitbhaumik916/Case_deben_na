/** One row of case_list_view, shared by the page and the table. */
export interface CaseRow {
  id: string;
  case_number: string;
  title: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  incident_date: string | null;
  days_open: number;
  case_type_id: string;
  case_type_name: string;
  case_type_slug: string;
  case_type_color: string;
  case_type_icon: string;
  status_key: string | null;
  status_label: string | null;
  status_color: string | null;
  lead_investigator_name: string | null;
  created_by_name: string | null;
}

export const CASE_SELECT =
  'id, case_number, title, address, city, county, state, lat, lng, created_at, incident_date, days_open, case_type_id, case_type_name, case_type_slug, case_type_color, case_type_icon, status_key, status_label, status_color, lead_investigator_name, created_by_name';
