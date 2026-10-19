// 이 파일은 마이그레이션에서 생성된다. 직접 수정하지 않는다. (npm run db:types)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: string
          initial_balance: number
          archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type?: string
          initial_balance?: number
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: string
          initial_balance?: number
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      allowed_emails: {
        Row: {
          email: string
          created_at: string
        }
        Insert: {
          email: string
          created_at?: string
        }
        Update: {
          email?: string
          created_at?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          month: string
          category_id: string | null
          amount: number
          alerted_80_at: string | null
          alerted_100_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          month: string
          category_id?: string | null
          amount: number
          alerted_80_at?: string | null
          alerted_100_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          month?: string
          category_id?: string | null
          amount?: number
          alerted_80_at?: string | null
          alerted_100_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      calendars: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          source: string
          google_calendar_id: string | null
          sync_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          source?: string
          google_calendar_id?: string | null
          sync_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          source?: string
          google_calendar_id?: string | null
          sync_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          kind: string
          color: string
          icon: string | null
          archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          kind: string
          color?: string
          icon?: string | null
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          kind?: string
          color?: string
          icon?: string | null
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_reminders: {
        Row: {
          id: string
          user_id: string
          event_id: string
          minutes_before: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_id: string
          minutes_before: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_id?: string
          minutes_before?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_user_id_fkey"
            columns: ["event_id", "user_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      events: {
        Row: {
          id: string
          user_id: string
          calendar_id: string | null
          title: string
          start_at: string
          end_at: string
          all_day: boolean
          location: string | null
          notes: string | null
          color: string | null
          rrule: string | null
          recurring_event_id: string | null
          original_start_at: string | null
          exdates: string[]
          google_event_id: string | null
          google_etag: string | null
          google_updated_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          calendar_id?: string | null
          title: string
          start_at: string
          end_at: string
          all_day?: boolean
          location?: string | null
          notes?: string | null
          color?: string | null
          rrule?: string | null
          recurring_event_id?: string | null
          original_start_at?: string | null
          exdates?: string[]
          google_event_id?: string | null
          google_etag?: string | null
          google_updated_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          calendar_id?: string | null
          title?: string
          start_at?: string
          end_at?: string
          all_day?: boolean
          location?: string | null
          notes?: string | null
          color?: string | null
          rrule?: string | null
          recurring_event_id?: string | null
          original_start_at?: string | null
          exdates?: string[]
          google_event_id?: string | null
          google_etag?: string | null
          google_updated_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_calendar_id_user_id_fkey"
            columns: ["calendar_id", "user_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "events_recurring_event_id_user_id_fkey"
            columns: ["recurring_event_id", "user_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      google_connections: {
        Row: {
          id: string
          user_id: string
          google_email: string
          refresh_token_enc: string
          sync_direction: string
          sync_token_by_calendar: Json
          last_synced_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          google_email: string
          refresh_token_enc: string
          sync_direction?: string
          sync_token_by_calendar?: Json
          last_synced_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          google_email?: string
          refresh_token_enc?: string
          sync_direction?: string
          sync_token_by_calendar?: Json
          last_synced_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_logs: {
        Row: {
          id: string
          user_id: string
          token_id: string | null
          tool: string
          input_summary: string | null
          status: string
          error: string | null
          duration_ms: number | null
          called_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token_id?: string | null
          tool: string
          input_summary?: string | null
          status: string
          error?: string | null
          duration_ms?: number | null
          called_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token_id?: string | null
          tool?: string
          input_summary?: string | null
          status?: string
          error?: string | null
          duration_ms?: number | null
          called_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_logs_token_id_user_id_fkey"
            columns: ["token_id", "user_id"]
            isOneToOne: false
            referencedRelation: "mcp_tokens"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          id: string
          user_id: string
          name: string
          token_hash: string
          token_prefix: string | null
          scopes: Json
          last_used_at: string | null
          revoked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          token_hash: string
          token_prefix?: string | null
          scopes?: Json
          last_used_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          token_hash?: string
          token_prefix?: string | null
          scopes?: Json
          last_used_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          id: string
          user_id: string
          enabled_types: Json
          channels: Json
          default_reminder_minutes: number[]
          quiet_start: string | null
          quiet_end: string | null
          push_subscriptions: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          enabled_types?: Json
          channels?: Json
          default_reminder_minutes?: number[]
          quiet_start?: string | null
          quiet_end?: string | null
          push_subscriptions?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          enabled_types?: Json
          channels?: Json
          default_reminder_minutes?: number[]
          quiet_start?: string | null
          quiet_end?: string | null
          push_subscriptions?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string | null
          link: string | null
          dedupe_key: string | null
          read_at: string | null
          scheduled_at: string
          delivered_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body?: string | null
          link?: string | null
          dedupe_key?: string | null
          read_at?: string | null
          scheduled_at?: string
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string | null
          link?: string | null
          dedupe_key?: string | null
          read_at?: string | null
          scheduled_at?: string
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          display_name: string | null
          timezone: string
          theme: string
          week_start: string
          start_screen: string
          weather_location: Json | null
          temp_unit: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          display_name?: string | null
          timezone?: string
          theme?: string
          week_start?: string
          start_screen?: string
          weather_location?: Json | null
          temp_unit?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          display_name?: string | null
          timezone?: string
          theme?: string
          week_start?: string
          start_screen?: string
          weather_location?: Json | null
          temp_unit?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          id: string
          user_id: string
          transaction_id: string
          storage_path: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_id: string
          storage_path: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_id?: string
          storage_path?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_transaction_id_user_id_fkey"
            columns: ["transaction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      recurring_payments: {
        Row: {
          id: string
          user_id: string
          name: string
          amount: number
          cycle: string
          pay_day: number
          pay_month: number | null
          category_id: string | null
          account_id: string
          next_run_date: string
          last_run_date: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          amount: number
          cycle?: string
          pay_day: number
          pay_month?: number | null
          category_id?: string | null
          account_id: string
          next_run_date: string
          last_run_date?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          amount?: number
          cycle?: string
          pay_day?: number
          pay_month?: number | null
          category_id?: string | null
          account_id?: string
          next_run_date?: string
          last_run_date?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_payments_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_payments_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          id: string
          user_id: string
          event_id: string | null
          kind: string
          detail: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_id?: string | null
          kind: string
          detail?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_id?: string | null
          kind?: string
          detail?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      todo_items: {
        Row: {
          id: string
          user_id: string
          todo_id: string
          text: string
          done: boolean
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          todo_id: string
          text: string
          done?: boolean
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          todo_id?: string
          text?: string
          done?: boolean
          position?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_items_todo_id_user_id_fkey"
            columns: ["todo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      todo_projects: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      todo_tags: {
        Row: {
          user_id: string
          todo_id: string
          tag_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          todo_id: string
          tag_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          todo_id?: string
          tag_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todo_tags_tag_id_user_id_fkey"
            columns: ["tag_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "todo_tags_todo_id_user_id_fkey"
            columns: ["todo_id", "user_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      todos: {
        Row: {
          id: string
          user_id: string
          project_id: string | null
          title: string
          notes: string | null
          due_date: string | null
          priority: string
          status: string
          completed_at: string | null
          recurrence_rule: string | null
          recurrence_source_id: string | null
          event_id: string | null
          position: number
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          project_id?: string | null
          title: string
          notes?: string | null
          due_date?: string | null
          priority?: string
          status?: string
          completed_at?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          event_id?: string | null
          position?: number
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          project_id?: string | null
          title?: string
          notes?: string | null
          due_date?: string | null
          priority?: string
          status?: string
          completed_at?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          event_id?: string | null
          position?: number
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_project_id_user_id_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "todo_projects"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          date: string
          amount: number
          type: string
          category_id: string | null
          account_id: string
          to_account_id: string | null
          memo: string | null
          recurring_id: string | null
          source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date?: string
          amount: number
          type: string
          category_id?: string | null
          account_id: string
          to_account_id?: string | null
          memo?: string | null
          recurring_id?: string | null
          source?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          amount?: number
          type?: string
          category_id?: string | null
          account_id?: string
          to_account_id?: string | null
          memo?: string | null
          recurring_id?: string | null
          source?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_user_id_fkey"
            columns: ["recurring_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recurring_payments"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_to_account_id_user_id_fkey"
            columns: ["to_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      weather_cache: {
        Row: {
          id: string
          location_key: string
          payload: Json
          fetched_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          location_key: string
          payload: Json
          fetched_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          location_key?: string
          payload?: Json
          fetched_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          user_id: string | null
          name: string | null
          type: string | null
          archived: boolean | null
          initial_balance: number | null
          balance: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      convert_todo_to_event: {
        Args: { p_todo_id: string; p_start_at: string; p_end_at: string; p_calendar_id?: string }
        Returns: { event_id: string; created: boolean }[]
      }
      budget_usage: {
        Args: { p_user?: string; p_month?: string }
        Returns: { category_id: string | null; budget: number; spent: number; ratio: number }[]
      }
      run_recurring_payments: {
        Args: { p_today?: string }
        Returns: number
      }
      next_pay_date: {
        Args: { p_cycle: string; p_pay_day: number; p_pay_month: number; p_after: string }
        Returns: string
      }
      complete_todo: {
        Args: { p_id: string; p_next_due?: string; p_next_rule?: string; p_user?: string }
        Returns: string
      }
      delete_my_account: {
        Args: never
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
