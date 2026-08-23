-- =============================================================================
-- SEED — starter data so a fresh database is immediately clickable.
--
-- Contains: one organisation, an org-wide status set, and two case types
-- installed through public.install_case_type_template(). The two types share
-- ZERO code: they differ only in the rows below, which is the point.
--
-- Demo users, cases, evidence and media are created by scripts/seed-demo.ts,
-- which needs the Auth admin API to make real sign-in-able accounts.
-- =============================================================================

insert into public.organizations (id, name, slug)
values ('11111111-1111-4111-8111-111111111111', 'Northgate Forensic Services', 'northgate')
on conflict (id) do nothing;

-- ---------- org-wide default status set -------------------------------------
-- case_type_id is null, so any case type that does not define its own statuses
-- inherits this pipeline.
insert into public.case_statuses
  (org_id, case_type_id, key, label, color, sort_order, is_initial, is_terminal, requires_review_role)
values
  ('11111111-1111-4111-8111-111111111111', null, 'draft',         'Draft',        '#6b7280', 0, true,  false, false),
  ('11111111-1111-4111-8111-111111111111', null, 'open',          'Open',         '#2563eb', 1, false, false, false),
  ('11111111-1111-4111-8111-111111111111', null, 'first_review',  '1st Review',   '#7c3aed', 2, false, false, false),
  ('11111111-1111-4111-8111-111111111111', null, 'second_review', '2nd Review',   '#9333ea', 3, false, false, false),
  ('11111111-1111-4111-8111-111111111111', null, 'approved',      'Approved',     '#16a34a', 4, false, false, true),
  ('11111111-1111-4111-8111-111111111111', null, 'not_approved',  'Not Approved', '#dc2626', 5, false, false, true),
  ('11111111-1111-4111-8111-111111111111', null, 'on_hold',       'On Hold',      '#d97706', 6, false, false, false),
  ('11111111-1111-4111-8111-111111111111', null, 'filed',         'Filed',        '#0891b2', 7, false, true,  true),
  ('11111111-1111-4111-8111-111111111111', null, 'closed',        'Closed',       '#334155', 8, false, true,  true)
on conflict do nothing;

-- ---------- retention default -----------------------------------------------
insert into public.retention_schedules (org_id, case_type_id, retention_years, policy_notes)
values (
  '11111111-1111-4111-8111-111111111111', null, 7,
  'Default organisational retention. Case files are retained for seven years from closure unless a longer statutory period applies.'
)
on conflict do nothing;

-- =============================================================================
-- CASE TYPE 1 — "Investigation" (generic starter template)
-- Inherits the org-wide status set above.
-- =============================================================================
select public.install_case_type_template(
  '11111111-1111-4111-8111-111111111111',
  '{
    "name": "Investigation",
    "slug": "investigation",
    "icon": "clipboard-list",
    "color": "#2563eb",
    "description": "General purpose starter template. Duplicate it to bootstrap a new discipline.",
    "sections": [
      {
        "key": "incident_overview",
        "label": "Incident Overview",
        "icon": "file-text",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "is_required": true,
        "completion_rule": "all_required_fields_filled",
        "fields": [
          { "key": "incident_type", "label": "Incident Type", "field_type": "select", "width": "half",
            "validation": { "required": true },
            "options": { "choices": [
              { "value": "property", "label": "Property" },
              { "value": "personal", "label": "Personal" },
              { "value": "vehicle",  "label": "Vehicle" },
              { "value": "other",    "label": "Other" } ] } },
          { "key": "incident_datetime", "label": "Date and Time of Incident", "field_type": "date", "width": "half",
            "validation": { "required": true } },
          { "key": "reported_by", "label": "Reported By", "field_type": "text", "width": "half" },
          { "key": "reference_number", "label": "External Reference", "field_type": "text", "width": "half",
            "help_text": "Insurer, police or client reference." },
          { "key": "summary", "label": "Incident Summary", "field_type": "textarea",
            "validation": { "required": true, "minLength": 20 },
            "placeholder": "One paragraph describing what is known at intake." }
        ]
      },
      {
        "key": "scene_documentation",
        "label": "Scene Documentation",
        "icon": "camera",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "completion_rule": "any_field_filled",
        "fields": [
          { "key": "scene_secured", "label": "Scene Secured on Arrival", "field_type": "boolean", "width": "half" },
          { "key": "arrival_time", "label": "Investigator Arrival", "field_type": "date", "width": "half" },
          { "key": "scene_description", "label": "Scene Description", "field_type": "textarea" },
          { "key": "weather_conditions", "label": "Weather and Lighting", "field_type": "text" },
          { "key": "scene_photographs", "label": "Scene Photographs", "field_type": "photo",
            "options": { "multiple": true, "accept": ["image/jpeg", "image/png", "image/heic"] } },
          { "key": "scene_diagram", "label": "Scene Diagram", "field_type": "file",
            "options": { "accept": ["application/pdf", "image/png"] } }
        ]
      },
      {
        "key": "people_involved",
        "label": "People Involved",
        "icon": "users",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "completion_rule": "any_field_filled",
        "fields": [
          { "key": "complainant", "label": "Complainant", "field_type": "person_ref", "width": "half",
            "options": { "roles": ["complainant", "victim", "owner"] } },
          { "key": "witness_count", "label": "Number of Witnesses", "field_type": "number", "width": "half",
            "validation": { "min": 0 } },
          { "key": "people_notes", "label": "Notes on Persons of Interest", "field_type": "textarea" }
        ]
      },
      {
        "key": "evidence_summary",
        "label": "Evidence Summary",
        "icon": "package",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "completion_rule": "any_field_filled",
        "fields": [
          { "key": "evidence_collected", "label": "Physical Evidence Collected", "field_type": "boolean", "width": "half" },
          { "key": "lab_submission_date", "label": "Laboratory Submission Date", "field_type": "date", "width": "half" },
          { "key": "evidence_notes", "label": "Collection Notes", "field_type": "textarea",
            "help_text": "Itemised entries belong in the Chain of Custody tab; summarise here." }
        ]
      },
      {
        "key": "findings",
        "label": "Findings and Conclusions",
        "icon": "gavel",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "is_required": true,
        "completion_rule": "all_required_fields_filled",
        "fields": [
          { "key": "determination", "label": "Determination", "field_type": "select", "width": "half",
            "validation": { "required": true },
            "options": { "choices": [
              { "value": "substantiated",   "label": "Substantiated" },
              { "value": "unsubstantiated", "label": "Unsubstantiated" },
              { "value": "inconclusive",    "label": "Inconclusive" } ] } },
          { "key": "confidence", "label": "Confidence", "field_type": "select", "width": "half",
            "options": { "choices": [
              { "value": "low",    "label": "Low" },
              { "value": "medium", "label": "Medium" },
              { "value": "high",   "label": "High" } ] } },
          { "key": "findings_narrative", "label": "Findings", "field_type": "textarea",
            "validation": { "required": true } },
          { "key": "recommendations", "label": "Recommendations", "field_type": "textarea" },
          { "key": "investigator_signature", "label": "Investigator Signature", "field_type": "signature" }
        ]
      }
    ],
    "checklists": [
      {
        "name": "General Investigation SOP",
        "source_standard": "Internal SOP",
        "version": "2024.1",
        "items": [
          { "section_ref": "incident_overview",   "label": "Intake details recorded and assignment confirmed" },
          { "section_ref": "incident_overview",   "label": "Conflict of interest check completed" },
          { "section_ref": "scene_documentation", "label": "Scene photographed before anything was moved" },
          { "section_ref": "scene_documentation", "label": "Overall, mid-range and close-up views captured" },
          { "section_ref": "scene_documentation", "label": "Scene sketch or diagram produced with measurements" },
          { "section_ref": "people_involved",     "label": "All identified witnesses contacted or attempts documented", "is_required": false },
          { "section_ref": "evidence_summary",    "label": "Every collected item entered in the chain of custody" },
          { "section_ref": "evidence_summary",    "label": "Storage conditions appropriate to the evidence type" },
          { "section_ref": "findings",            "label": "Alternative explanations considered and addressed" },
          { "section_ref": "findings",            "label": "Report peer reviewed before release" }
        ]
      }
    ],
    "report_sections": [
      {
        "heading": "Executive Summary",
        "source_section_keys": ["incident_overview", "findings"],
        "draft_prompt": "Write a concise executive summary of this investigation in third person, past tense, suitable for a client or court reader. Open with what was investigated and when, then state the determination and the single strongest reason supporting it. Do not introduce facts that are not present in the supplied data. Aim for 120 to 180 words."
      },
      {
        "heading": "Scene Documentation",
        "source_section_keys": ["scene_documentation"],
        "draft_prompt": "Describe the scene as documented, in neutral third person past tense. Cover the condition of the scene on arrival, whether it was secured, environmental conditions, and what was photographed or diagrammed. State observations only; draw no conclusions."
      },
      {
        "heading": "Persons Interviewed",
        "source_section_keys": ["people_involved"],
        "draft_prompt": "Summarise the persons connected to this matter and their relationship to it. List each person, their role, and the substance of any information they provided. Where a person was not reached, say so plainly."
      },
      {
        "heading": "Evidence",
        "source_section_keys": ["evidence_summary"],
        "draft_prompt": "Summarise the physical evidence collected, where it was recovered from, and its disposition, including any laboratory submission. Refer to items by their item number. Do not characterise the significance of any item here."
      },
      {
        "heading": "Findings and Conclusions",
        "source_section_keys": ["findings"],
        "draft_prompt": "State the findings and the determination reached, with the reasoning that supports it. Address alternative explanations that were considered and why they were excluded. Where confidence is less than high, say so explicitly and explain what additional information would resolve it. Use measured, defensible language appropriate to a forensic report."
      }
    ]
  }'::jsonb
);

-- =============================================================================
-- CASE TYPE 2 — "Fire Investigation"
-- A different discipline with its OWN sections, fields, tabs, status pipeline,
-- checklist and report template. Same engine, no code.
-- =============================================================================
select public.install_case_type_template(
  '11111111-1111-4111-8111-111111111111',
  '{
    "name": "Fire Investigation",
    "slug": "fire-investigation",
    "icon": "flame",
    "color": "#c2410c",
    "description": "Origin and cause determination for fire and explosion scenes.",
    "statuses": [
      { "key": "reported",     "label": "Reported",       "color": "#6b7280", "is_initial": true },
      { "key": "scene_exam",   "label": "Scene Exam",     "color": "#ea580c" },
      { "key": "lab_pending",  "label": "Lab Pending",    "color": "#d97706" },
      { "key": "analysis",     "label": "Analysis",       "color": "#2563eb" },
      { "key": "peer_review",  "label": "Peer Review",    "color": "#7c3aed" },
      { "key": "final_report", "label": "Final Report",   "color": "#16a34a", "requires_review_role": true },
      { "key": "closed",       "label": "Closed",         "color": "#334155", "is_terminal": true, "requires_review_role": true }
    ],
    "sections": [
      {
        "key": "scene_information",
        "label": "Scene Information",
        "icon": "map-pin",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "is_required": true,
        "completion_rule": "all_required_fields_filled",
        "fields": [
          { "key": "structure_type", "label": "Structure Type", "field_type": "select", "width": "half",
            "validation": { "required": true },
            "options": { "choices": [
              { "value": "residential",  "label": "Residential" },
              { "value": "commercial",   "label": "Commercial" },
              { "value": "industrial",   "label": "Industrial" },
              { "value": "vehicle",      "label": "Vehicle" },
              { "value": "outdoor",      "label": "Outdoor / Wildland" } ] } },
          { "key": "alarm_time", "label": "Time of Alarm", "field_type": "date", "width": "half" },
          { "key": "suppression_agency", "label": "Suppression Agency", "field_type": "text", "width": "half" },
          { "key": "occupancy_at_time", "label": "Occupied at Time of Fire", "field_type": "boolean", "width": "half" },
          { "key": "damage_description", "label": "Extent of Damage", "field_type": "textarea",
            "validation": { "required": true } },
          { "key": "scene_photographs", "label": "Scene Photographs", "field_type": "photo",
            "options": { "multiple": true } }
        ]
      },
      {
        "key": "origin",
        "label": "Area of Origin",
        "icon": "target",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "is_required": true,
        "completion_rule": "all_required_fields_filled",
        "fields": [
          { "key": "area_of_origin", "label": "Area of Origin", "field_type": "text",
            "validation": { "required": true } },
          { "key": "point_of_origin", "label": "Point of Origin", "field_type": "textarea" },
          { "key": "fire_patterns", "label": "Fire Patterns Observed", "field_type": "multiselect",
            "options": { "choices": [
              { "value": "v_pattern",       "label": "V pattern" },
              { "value": "u_pattern",       "label": "U pattern" },
              { "value": "hourglass",       "label": "Hourglass" },
              { "value": "clean_burn",      "label": "Clean burn" },
              { "value": "calcination",     "label": "Calcination" },
              { "value": "spalling",        "label": "Spalling" },
              { "value": "penetration",     "label": "Floor penetration" } ] } },
          { "key": "origin_confidence", "label": "Confidence in Origin", "field_type": "select", "width": "half",
            "options": { "choices": [
              { "value": "possible",  "label": "Possible" },
              { "value": "probable",  "label": "Probable" },
              { "value": "confirmed", "label": "Confirmed" } ] } }
        ]
      },
      {
        "key": "cause",
        "label": "Cause Determination",
        "icon": "flame",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "is_required": true,
        "completion_rule": "all_required_fields_filled",
        "fields": [
          { "key": "classification", "label": "Fire Classification", "field_type": "select", "width": "half",
            "validation": { "required": true },
            "options": { "choices": [
              { "value": "accidental",   "label": "Accidental" },
              { "value": "incendiary",   "label": "Incendiary" },
              { "value": "natural",      "label": "Natural" },
              { "value": "undetermined", "label": "Undetermined" } ] } },
          { "key": "first_fuel_ignited", "label": "First Fuel Ignited", "field_type": "text", "width": "half" },
          { "key": "ignition_source", "label": "Ignition Source", "field_type": "text", "width": "half" },
          { "key": "ignition_sequence", "label": "Ignition Sequence", "field_type": "textarea",
            "help_text": "The sequence of events that brought the ignition source and first fuel together." },
          { "key": "hypotheses_tested", "label": "Hypotheses Tested and Excluded", "field_type": "textarea",
            "validation": { "required": true } }
        ]
      },
      {
        "key": "utilities",
        "label": "Utilities and Appliances",
        "icon": "plug",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "completion_rule": "any_field_filled",
        "fields": [
          { "key": "electrical_service", "label": "Electrical Service Condition", "field_type": "textarea" },
          { "key": "gas_service", "label": "Gas Service Condition", "field_type": "textarea" },
          { "key": "appliances_examined", "label": "Appliances Examined", "field_type": "textarea" },
          { "key": "utilities_photographs", "label": "Utility Photographs", "field_type": "photo",
            "options": { "multiple": true } }
        ]
      },
      {
        "key": "witness_accounts",
        "label": "Witness Accounts",
        "icon": "message-square",
        "tab_key": "interviews",
        "tab_label": "Interviews",
        "tab_sort_order": 1,
        "completion_rule": "any_field_filled",
        "fields": [
          { "key": "first_observer", "label": "First Person to Observe the Fire", "field_type": "person_ref" },
          { "key": "observed_conditions", "label": "Conditions Described by Witnesses", "field_type": "textarea" },
          { "key": "smoke_colour", "label": "Reported Smoke Colour", "field_type": "text", "width": "half" },
          { "key": "flame_colour", "label": "Reported Flame Colour", "field_type": "text", "width": "half" }
        ]
      },
      {
        "key": "insurance",
        "label": "Insurance and Loss",
        "icon": "shield",
        "tab_key": "administration",
        "tab_label": "Administration",
        "tab_sort_order": 2,
        "completion_rule": "any_field_filled",
        "fields": [
          { "key": "insurer", "label": "Insurer", "field_type": "text", "width": "half" },
          { "key": "policy_number", "label": "Policy Number", "field_type": "text", "width": "half" },
          { "key": "estimated_loss", "label": "Estimated Loss", "field_type": "number", "width": "half",
            "options": { "prefix": "$", "step": 100 } },
          { "key": "subrogation_potential", "label": "Subrogation Potential", "field_type": "boolean", "width": "half" }
        ]
      },
      {
        "key": "conclusions",
        "label": "Opinions and Conclusions",
        "icon": "gavel",
        "tab_key": "documentation",
        "tab_label": "Documentation",
        "tab_sort_order": 0,
        "is_required": true,
        "completion_rule": "all_required_fields_filled",
        "fields": [
          { "key": "opinion", "label": "Opinion", "field_type": "textarea",
            "validation": { "required": true } },
          { "key": "opinion_confidence", "label": "Level of Certainty", "field_type": "select", "width": "half",
            "options": { "choices": [
              { "value": "possible", "label": "Possible" },
              { "value": "probable", "label": "Probable" },
              { "value": "reasonable_degree", "label": "Reasonable degree of scientific certainty" } ] } },
          { "key": "investigator_signature", "label": "Investigator Signature", "field_type": "signature" }
        ]
      }
    ],
    "checklists": [
      {
        "name": "Fire Scene Examination Checklist",
        "source_standard": "Internal SOP aligned to NFPA 921",
        "version": "2024.1",
        "items": [
          { "section_ref": "scene_information", "label": "Scene secured and authority to enter documented" },
          { "section_ref": "scene_information", "label": "Exterior documented on all elevations before entry" },
          { "section_ref": "scene_information", "label": "Suppression crew interviewed about conditions on arrival" },
          { "section_ref": "origin",            "label": "Fire patterns documented before debris removal" },
          { "section_ref": "origin",            "label": "Layered excavation performed and photographed" },
          { "section_ref": "origin",            "label": "Area of origin supported by more than one line of evidence" },
          { "section_ref": "cause",             "label": "All potential ignition sources in the origin area identified" },
          { "section_ref": "cause",             "label": "Each hypothesis tested against the physical evidence" },
          { "section_ref": "cause",             "label": "Undetermined considered as a legitimate outcome" },
          { "section_ref": "utilities",         "label": "Electrical and gas services examined and documented" },
          { "section_ref": "conclusions",       "label": "Opinion stated with an explicit level of certainty" },
          { "section_ref": "conclusions",       "label": "Peer review completed before release" }
        ]
      }
    ],
    "report_sections": [
      {
        "heading": "Summary of Findings",
        "source_section_keys": ["scene_information", "cause", "conclusions"],
        "draft_prompt": "Write the summary of findings for a fire investigation report. State the property, the date of the fire, the area of origin, the classification, and the opinion with its level of certainty. Third person, past tense, 120 to 180 words. Use only the supplied data."
      },
      {
        "heading": "Scene Description",
        "source_section_keys": ["scene_information"],
        "draft_prompt": "Describe the structure, its occupancy at the time of the fire, the suppression response, and the extent and distribution of damage. Observations only, no conclusions."
      },
      {
        "heading": "Area and Point of Origin",
        "source_section_keys": ["origin"],
        "draft_prompt": "Explain how the area of origin was determined. Describe the fire patterns observed and how they were interpreted, and state the confidence in the origin determination. Make the reasoning explicit and traceable to the observations."
      },
      {
        "heading": "Utilities and Appliances",
        "source_section_keys": ["utilities"],
        "draft_prompt": "Report the condition of the electrical and gas services and any appliances examined within the area of origin, and whether each was eliminated as an ignition source."
      },
      {
        "heading": "Witness Accounts",
        "source_section_keys": ["witness_accounts"],
        "draft_prompt": "Summarise what witnesses reported observing, attributing each account to its source. Note where accounts conflict with the physical evidence rather than reconciling them silently."
      },
      {
        "heading": "Cause Determination",
        "source_section_keys": ["cause"],
        "draft_prompt": "Set out the ignition sequence, the first fuel ignited and the ignition source, then the classification. List each alternative hypothesis that was tested and the evidence that excluded it. If the cause is undetermined, state plainly what prevented a determination."
      },
      {
        "heading": "Opinions and Conclusions",
        "source_section_keys": ["conclusions"],
        "draft_prompt": "State the investigator opinion and the level of certainty held, in language appropriate for testimony. Do not overstate certainty beyond what the supplied evidence supports."
      }
    ]
  }'::jsonb
);
