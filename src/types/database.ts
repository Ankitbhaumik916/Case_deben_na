export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          case_id: string | null
          created_at: string
          id: string
          metadata: Json
          org_id: string
          summary: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          org_id: string
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          org_id?: string
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          author_id: string | null
          body: string
          case_id: string
          created_at: string
          id: string
          org_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          case_id: string
          created_at?: string
          id?: string
          org_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          case_id?: string
          created_at?: string
          id?: string
          org_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notes_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "admin_notes_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "admin_notes_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "admin_notes_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "admin_notes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "admin_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      case_checklist_responses: {
        Row: {
          case_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          is_checked: boolean
          item_id: string
          note: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean
          item_id: string
          note?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean
          item_id?: string
          note?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_checklist_responses_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_checklist_responses_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_checklist_responses_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_checklist_responses_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_checklist_responses_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_checklist_responses_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_checklist_responses_item_fkey"
            columns: ["item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      case_field_values: {
        Row: {
          case_id: string
          created_at: string
          field_id: string
          id: string
          org_id: string
          updated_at: string
          updated_by: string | null
          value: Json | null
        }
        Insert: {
          case_id: string
          created_at?: string
          field_id: string
          id?: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Update: {
          case_id?: string
          created_at?: string
          field_id?: string
          id?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "case_field_values_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_field_values_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_field_values_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_field_values_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_field_values_field_fkey"
            columns: ["field_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_fields"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_field_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_field_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      case_investigators: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          case_id: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          case_id: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          case_id?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_investigators_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_investigators_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_investigators_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_investigators_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_investigators_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_investigators_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_investigators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_investigators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      case_people: {
        Row: {
          case_id: string
          contact_info: Json
          created_at: string
          created_by: string | null
          full_name: string
          id: string
          notes: string | null
          org_id: string
          role: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          case_id: string
          contact_info?: Json
          created_at?: string
          created_by?: string | null
          full_name: string
          id?: string
          notes?: string | null
          org_id: string
          role?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          case_id?: string
          contact_info?: Json
          created_at?: string
          created_by?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          org_id?: string
          role?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_people_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_people_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_people_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_people_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      case_report_section_drafts: {
        Row: {
          case_id: string
          content: string | null
          created_at: string
          edited_by: string | null
          generated_at: string | null
          id: string
          is_ai_generated: boolean
          is_included: boolean
          org_id: string
          report_section_id: string
          updated_at: string
        }
        Insert: {
          case_id: string
          content?: string | null
          created_at?: string
          edited_by?: string | null
          generated_at?: string | null
          id?: string
          is_ai_generated?: boolean
          is_included?: boolean
          org_id: string
          report_section_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          content?: string | null
          created_at?: string
          edited_by?: string | null
          generated_at?: string | null
          id?: string
          is_ai_generated?: boolean
          is_included?: boolean
          org_id?: string
          report_section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_report_section_drafts_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_report_section_drafts_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_report_section_drafts_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_report_section_drafts_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_report_section_drafts_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_report_section_drafts_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_report_section_drafts_section_fkey"
            columns: ["report_section_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_report_sections"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      case_section_status: {
        Row: {
          case_id: string
          created_at: string
          id: string
          is_complete: boolean
          org_id: string
          section_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          is_complete?: boolean
          org_id: string
          section_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          is_complete?: boolean
          org_id?: string
          section_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_section_status_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_section_status_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_section_status_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "case_section_status_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_section_status_section_fkey"
            columns: ["section_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_sections"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_section_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_section_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      case_statuses: {
        Row: {
          case_type_id: string | null
          color: string
          created_at: string
          id: string
          is_active: boolean
          is_initial: boolean
          is_terminal: boolean
          key: string
          label: string
          org_id: string
          requires_review_role: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          case_type_id?: string | null
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_initial?: boolean
          is_terminal?: boolean
          key: string
          label: string
          org_id: string
          requires_review_role?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          case_type_id?: string | null
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_initial?: boolean
          is_terminal?: boolean
          key?: string
          label?: string
          org_id?: string
          requires_review_role?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_statuses_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "case_statuses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_type_checklists: {
        Row: {
          case_type_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          source_standard: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          case_type_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          source_standard?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          case_type_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          source_standard?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_type_checklists_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      case_type_fields: {
        Row: {
          created_at: string
          default_value: Json | null
          field_type: Database["public"]["Enums"]["field_type"]
          help_text: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          options: Json
          org_id: string
          placeholder: string | null
          section_id: string
          sort_order: number
          updated_at: string
          validation: Json
          width: string
        }
        Insert: {
          created_at?: string
          default_value?: Json | null
          field_type?: Database["public"]["Enums"]["field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          options?: Json
          org_id: string
          placeholder?: string | null
          section_id: string
          sort_order?: number
          updated_at?: string
          validation?: Json
          width?: string
        }
        Update: {
          created_at?: string
          default_value?: Json | null
          field_type?: Database["public"]["Enums"]["field_type"]
          help_text?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          options?: Json
          org_id?: string
          placeholder?: string | null
          section_id?: string
          sort_order?: number
          updated_at?: string
          validation?: Json
          width?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_type_fields_section_fkey"
            columns: ["section_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_sections"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      case_type_report_sections: {
        Row: {
          case_type_id: string
          created_at: string
          draft_prompt: string | null
          heading: string
          id: string
          include_by_default: boolean
          is_active: boolean
          org_id: string
          sort_order: number
          source_section_ids: Json
          updated_at: string
        }
        Insert: {
          case_type_id: string
          created_at?: string
          draft_prompt?: string | null
          heading: string
          id?: string
          include_by_default?: boolean
          is_active?: boolean
          org_id: string
          sort_order?: number
          source_section_ids?: Json
          updated_at?: string
        }
        Update: {
          case_type_id?: string
          created_at?: string
          draft_prompt?: string | null
          heading?: string
          id?: string
          include_by_default?: boolean
          is_active?: boolean
          org_id?: string
          sort_order?: number
          source_section_ids?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_type_report_sections_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      case_type_sections: {
        Row: {
          case_type_id: string
          completion_rule: Database["public"]["Enums"]["completion_rule"]
          created_at: string
          description: string | null
          icon: string
          id: string
          is_active: boolean
          is_required: boolean
          key: string
          label: string
          org_id: string
          sort_order: number
          tab_key: string
          tab_label: string
          tab_sort_order: number
          updated_at: string
        }
        Insert: {
          case_type_id: string
          completion_rule?: Database["public"]["Enums"]["completion_rule"]
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          key: string
          label: string
          org_id: string
          sort_order?: number
          tab_key?: string
          tab_label?: string
          tab_sort_order?: number
          updated_at?: string
        }
        Update: {
          case_type_id?: string
          completion_rule?: Database["public"]["Enums"]["completion_rule"]
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          key?: string
          label?: string
          org_id?: string
          sort_order?: number
          tab_key?: string
          tab_label?: string
          tab_sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_type_sections_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      case_types: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          address: string | null
          address_line2: string | null
          archived_at: string | null
          case_number: string
          case_type_id: string
          city: string | null
          closed_at: string | null
          county: string | null
          created_at: string
          created_by: string | null
          id: string
          incident_date: string | null
          lat: number | null
          lead_investigator_id: string | null
          lng: number | null
          org_id: string
          postal_code: string | null
          search_document: string | null
          search_tsv: unknown
          state: string | null
          status_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_line2?: string | null
          archived_at?: string | null
          case_number: string
          case_type_id: string
          city?: string | null
          closed_at?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          incident_date?: string | null
          lat?: number | null
          lead_investigator_id?: string | null
          lng?: number | null
          org_id: string
          postal_code?: string | null
          search_document?: string | null
          search_tsv?: unknown
          state?: string | null
          status_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_line2?: string | null
          archived_at?: string | null
          case_number?: string
          case_type_id?: string
          city?: string | null
          closed_at?: string | null
          county?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          incident_date?: string | null
          lat?: number | null
          lead_investigator_id?: string | null
          lng?: number | null
          org_id?: string
          postal_code?: string | null
          search_document?: string | null
          search_tsv?: unknown
          state?: string | null
          status_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_lead_investigator_id_fkey"
            columns: ["lead_investigator_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cases_lead_investigator_id_fkey"
            columns: ["lead_investigator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_status_fkey"
            columns: ["status_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_statuses"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          checklist_id: string
          created_at: string
          help_text: string | null
          id: string
          is_required: boolean
          label: string
          org_id: string
          section_ref: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label: string
          org_id: string
          section_ref?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label?: string
          org_id?: string
          section_ref?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_fkey"
            columns: ["checklist_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_checklists"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      custody_events: {
        Row: {
          actor_name: string
          actor_user_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["custody_event_type"]
          evidence_id: string
          id: string
          location: string | null
          notes: string | null
          occurred_at: string
          org_id: string
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          actor_name: string
          actor_user_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["custody_event_type"]
          evidence_id: string
          id?: string
          location?: string | null
          notes?: string | null
          occurred_at?: string
          org_id: string
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["custody_event_type"]
          evidence_id?: string
          id?: string
          location?: string | null
          notes?: string | null
          occurred_at?: string
          org_id?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custody_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "custody_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_evidence_fkey"
            columns: ["evidence_id", "org_id"]
            isOneToOne: false
            referencedRelation: "evidence_items"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "custody_events_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "custody_events_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_items: {
        Row: {
          case_id: string
          category: string | null
          collected_at: string | null
          collected_by: string | null
          collected_by_id: string | null
          collected_from: string | null
          created_at: string
          created_by: string | null
          current_location: string | null
          current_status: string
          description: string
          disposition: string | null
          exam_requested: string | null
          id: string
          item_number: string
          notes: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          case_id: string
          category?: string | null
          collected_at?: string | null
          collected_by?: string | null
          collected_by_id?: string | null
          collected_from?: string | null
          created_at?: string
          created_by?: string | null
          current_location?: string | null
          current_status?: string
          description: string
          disposition?: string | null
          exam_requested?: string | null
          id?: string
          item_number: string
          notes?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          category?: string | null
          collected_at?: string | null
          collected_by?: string | null
          collected_by_id?: string | null
          collected_from?: string | null
          created_at?: string
          created_by?: string | null
          current_location?: string | null
          current_status?: string
          description?: string
          disposition?: string | null
          exam_requested?: string | null
          id?: string
          item_number?: string
          notes?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_items_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "evidence_items_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "evidence_items_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "evidence_items_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "evidence_items_collected_by_id_fkey"
            columns: ["collected_by_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "evidence_items_collected_by_id_fkey"
            columns: ["collected_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "evidence_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          ai_summary: string | null
          ai_summary_generated_at: string | null
          ai_summary_type: Database["public"]["Enums"]["summary_length"] | null
          audio_mime: string | null
          audio_path: string | null
          bucket: string
          case_id: string
          conducted_by: string | null
          conducted_by_id: string | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          id: string
          interview_date: string | null
          location: string | null
          narrative: string | null
          org_id: string
          subject_name: string
          subject_person_id: string | null
          transcript: string | null
          transcript_error: string | null
          transcript_status: Database["public"]["Enums"]["transcript_status"]
          transcript_updated_at: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          ai_summary_type?: Database["public"]["Enums"]["summary_length"] | null
          audio_mime?: string | null
          audio_path?: string | null
          bucket?: string
          case_id: string
          conducted_by?: string | null
          conducted_by_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          interview_date?: string | null
          location?: string | null
          narrative?: string | null
          org_id: string
          subject_name: string
          subject_person_id?: string | null
          transcript?: string | null
          transcript_error?: string | null
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          transcript_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          ai_summary_type?: Database["public"]["Enums"]["summary_length"] | null
          audio_mime?: string | null
          audio_path?: string | null
          bucket?: string
          case_id?: string
          conducted_by?: string | null
          conducted_by_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          interview_date?: string | null
          location?: string | null
          narrative?: string | null
          org_id?: string
          subject_name?: string
          subject_person_id?: string | null
          transcript?: string | null
          transcript_error?: string | null
          transcript_status?: Database["public"]["Enums"]["transcript_status"]
          transcript_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "interviews_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "interviews_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "interviews_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "interviews_conducted_by_id_fkey"
            columns: ["conducted_by_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interviews_conducted_by_id_fkey"
            columns: ["conducted_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_person_fkey"
            columns: ["subject_person_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_people"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      media_files: {
        Row: {
          annotations: Json
          bucket: string
          caption: string | null
          captured_at: string | null
          case_id: string
          created_at: string
          duration_seconds: number | null
          field_id: string | null
          file_name: string
          height: number | null
          id: string
          mime_type: string | null
          org_id: string
          section_id: string | null
          size_bytes: number | null
          storage_path: string
          tags: Json
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          annotations?: Json
          bucket?: string
          caption?: string | null
          captured_at?: string | null
          case_id: string
          created_at?: string
          duration_seconds?: number | null
          field_id?: string | null
          file_name: string
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id: string
          section_id?: string | null
          size_bytes?: number | null
          storage_path: string
          tags?: Json
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          annotations?: Json
          bucket?: string
          caption?: string | null
          captured_at?: string | null
          case_id?: string
          created_at?: string
          duration_seconds?: number | null
          field_id?: string | null
          file_name?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          section_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          tags?: Json
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_files_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "media_files_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "media_files_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "media_files_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "media_files_field_fkey"
            columns: ["field_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_fields"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "media_files_section_fkey"
            columns: ["section_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_sections"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "media_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "media_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      media_log_reports: {
        Row: {
          bucket: string
          case_id: string
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          media_ids: Json
          org_id: string
          storage_path: string | null
          title: string
        }
        Insert: {
          bucket?: string
          case_id: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          media_ids?: Json
          org_id: string
          storage_path?: string | null
          title: string
        }
        Update: {
          bucket?: string
          case_id?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          media_ids?: Json
          org_id?: string
          storage_path?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_log_reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "media_log_reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "media_log_reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "media_log_reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "media_log_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "media_log_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_section_status: {
        Row: {
          content_snapshot: string | null
          created_at: string
          heading_snapshot: string | null
          id: string
          org_id: string
          report_id: string
          report_section_id: string | null
          sort_order: number
          status: Database["public"]["Enums"]["report_section_state"]
        }
        Insert: {
          content_snapshot?: string | null
          created_at?: string
          heading_snapshot?: string | null
          id?: string
          org_id: string
          report_id: string
          report_section_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["report_section_state"]
        }
        Update: {
          content_snapshot?: string | null
          created_at?: string
          heading_snapshot?: string | null
          id?: string
          org_id?: string
          report_id?: string
          report_section_id?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["report_section_state"]
        }
        Relationships: [
          {
            foreignKeyName: "report_section_status_report_fkey"
            columns: ["report_id", "org_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "report_section_status_section_fkey"
            columns: ["report_section_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_type_report_sections"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      reports: {
        Row: {
          bucket: string
          case_id: string
          created_at: string
          generated_at: string | null
          generated_by: string | null
          generated_pdf_path: string | null
          id: string
          org_id: string
          status: Database["public"]["Enums"]["report_status"]
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          bucket?: string
          case_id: string
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          generated_pdf_path?: string | null
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["report_status"]
          title?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          bucket?: string
          case_id?: string
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          generated_pdf_path?: string | null
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_checklist_progress"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_list_view"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_section_completion"
            referencedColumns: ["case_id", "org_id"]
          },
          {
            foreignKeyName: "reports_case_fkey"
            columns: ["case_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_schedules: {
        Row: {
          case_type_id: string | null
          created_at: string
          id: string
          org_id: string
          policy_notes: string | null
          retention_years: number
          updated_at: string
        }
        Insert: {
          case_type_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          policy_notes?: string | null
          retention_years?: number
          updated_at?: string
        }
        Update: {
          case_type_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          policy_notes?: string | null
          retention_years?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_schedules_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "retention_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: string
          label: string
          name: string
          rank: number
        }
        Insert: {
          id?: string
          label: string
          name: string
          rank: number
        }
        Update: {
          id?: string
          label?: string
          name?: string
          rank?: number
        }
        Relationships: []
      }
      saved_views: {
        Row: {
          case_type_id: string | null
          columns: Json
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          is_locked: boolean
          is_shared: boolean
          name: string
          org_id: string
          sort: Json
          sort_order: number
          updated_at: string
          user_id: string | null
          view_mode: string
        }
        Insert: {
          case_type_id?: string | null
          columns?: Json
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          is_locked?: boolean
          is_shared?: boolean
          name: string
          org_id: string
          sort?: Json
          sort_order?: number
          updated_at?: string
          user_id?: string | null
          view_mode?: string
        }
        Update: {
          case_type_id?: string | null
          columns?: Json
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          is_locked?: boolean
          is_shared?: boolean
          name?: string
          org_id?: string
          sort?: Json
          sort_order?: number
          updated_at?: string
          user_id?: string | null
          view_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "saved_views_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "saved_views_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          job_title: string | null
          org_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          job_title?: string | null
          org_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          org_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      case_checklist_progress: {
        Row: {
          case_id: string | null
          checked_items: number | null
          checked_required_items: number | null
          checklist_id: string | null
          checklist_name: string | null
          org_id: string | null
          required_items: number | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_list_view: {
        Row: {
          address: string | null
          archived_at: string | null
          case_number: string | null
          case_type_color: string | null
          case_type_icon: string | null
          case_type_id: string | null
          case_type_name: string | null
          case_type_slug: string | null
          city: string | null
          closed_at: string | null
          county: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          days_open: number | null
          id: string | null
          incident_date: string | null
          lat: number | null
          lead_investigator_id: string | null
          lead_investigator_name: string | null
          lng: number | null
          org_id: string | null
          search_tsv: unknown
          state: string | null
          status_color: string | null
          status_id: string | null
          status_key: string | null
          status_label: string | null
          status_sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_case_type_fkey"
            columns: ["case_type_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_lead_investigator_id_fkey"
            columns: ["lead_investigator_id"]
            isOneToOne: false
            referencedRelation: "investigator_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cases_lead_investigator_id_fkey"
            columns: ["lead_investigator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_status_fkey"
            columns: ["status_id", "org_id"]
            isOneToOne: false
            referencedRelation: "case_statuses"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      case_section_completion: {
        Row: {
          case_id: string | null
          completion_rule: Database["public"]["Enums"]["completion_rule"] | null
          filled_fields: number | null
          filled_required_fields: number | null
          manually_complete: boolean | null
          org_id: string | null
          required_fields: number | null
          section_id: string | null
          section_key: string | null
          section_label: string | null
          total_fields: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      investigator_workload: {
        Row: {
          additional_cases: number | null
          email: string | null
          full_name: string | null
          lead_cases: number | null
          org_id: string | null
          primary_cases: number | null
          secondary_cases: number | null
          total_cases: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      audit_ignored_columns: { Args: never; Returns: string[] }
      build_case_search_document: {
        Args: { p_case_id: string }
        Returns: string
      }
      can_admin: { Args: { p_org_id: string }; Returns: boolean }
      can_review: { Args: { p_org_id: string }; Returns: boolean }
      can_write: { Args: { p_org_id: string }; Returns: boolean }
      current_role_rank: { Args: { p_org_id: string }; Returns: number }
      diff_jsonb: { Args: { p_new: Json; p_old: Json }; Returns: Json }
      duplicate_case_type: {
        Args: { p_case_type_id: string; p_new_name: string; p_new_slug: string }
        Returns: string
      }
      export_case_type_template: {
        Args: { p_case_type_id: string }
        Returns: Json
      }
      install_case_type_template: {
        Args: { p_org_id: string; p_spec: Json }
        Returns: string
      }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_super_admin: { Args: { p_org_id: string }; Returns: boolean }
      jsonb_is_filled: { Args: { p_value: Json }; Returns: boolean }
      jsonb_to_search_text: { Args: { p_value: Json }; Returns: string }
      log_activity: {
        Args: {
          p_action: string
          p_case_id?: string
          p_metadata?: Json
          p_org_id?: string
          p_summary?: string
          p_target_id?: string
          p_target_type?: string
        }
        Returns: string
      }
      refresh_case_search: { Args: { p_case_id: string }; Returns: undefined }
      role_rank: { Args: { p_role: string }; Returns: number }
      shares_org_with: { Args: { p_user_id: string }; Returns: boolean }
      storage_org_id: { Args: { p_name: string }; Returns: string }
      strip_markup: { Args: { p_text: string }; Returns: string }
      truncate_jsonb_value: { Args: { p_value: Json }; Returns: Json }
    }
    Enums: {
      completion_rule:
        | "any_field_filled"
        | "all_fields_filled"
        | "all_required_fields_filled"
        | "manual"
      custody_event_type:
        | "collected"
        | "transferred"
        | "released"
        | "received"
        | "returned"
        | "destroyed"
      field_type:
        | "text"
        | "textarea"
        | "number"
        | "date"
        | "select"
        | "multiselect"
        | "photo"
        | "file"
        | "signature"
        | "boolean"
        | "person_ref"
        | "computed"
      report_section_state: "complete" | "incomplete" | "excluded"
      report_status: "draft" | "generated" | "final"
      summary_length: "brief" | "standard" | "detailed"
      transcript_status:
        | "not_started"
        | "pending"
        | "processing"
        | "complete"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      completion_rule: [
        "any_field_filled",
        "all_fields_filled",
        "all_required_fields_filled",
        "manual",
      ],
      custody_event_type: [
        "collected",
        "transferred",
        "released",
        "received",
        "returned",
        "destroyed",
      ],
      field_type: [
        "text",
        "textarea",
        "number",
        "date",
        "select",
        "multiselect",
        "photo",
        "file",
        "signature",
        "boolean",
        "person_ref",
        "computed",
      ],
      report_section_state: ["complete", "incomplete", "excluded"],
      report_status: ["draft", "generated", "final"],
      summary_length: ["brief", "standard", "detailed"],
      transcript_status: [
        "not_started",
        "pending",
        "processing",
        "complete",
        "failed",
      ],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
