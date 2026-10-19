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
    PostgrestVersion: "14.18"
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
      accounts: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          initial_balance: number
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          initial_balance?: number
          name: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          initial_balance?: number
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      allowed_emails: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          alerted_100_at: string | null
          alerted_80_at: string | null
          amount: number
          category_id: string | null
          created_at: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alerted_100_at?: string | null
          alerted_80_at?: string | null
          amount: number
          category_id?: string | null
          created_at?: string
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alerted_100_at?: string | null
          alerted_80_at?: string | null
          amount?: number
          category_id?: string | null
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
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
          color: string
          created_at: string
          google_calendar_id: string | null
          id: string
          name: string
          source: string
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          google_calendar_id?: string | null
          id?: string
          name: string
          source?: string
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          google_calendar_id?: string | null
          id?: string
          name?: string
          source?: string
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          icon: string | null
          id: string
          kind: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          kind: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_reminders: {
        Row: {
          created_at: string
          event_id: string
          id: string
          minutes_before: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          minutes_before: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          minutes_before?: number
          updated_at?: string
          user_id?: string
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
          all_day: boolean
          calendar_id: string | null
          color: string | null
          created_at: string
          deleted_at: string | null
          end_at: string
          exdates: string[]
          google_etag: string | null
          google_event_id: string | null
          google_updated_at: string | null
          id: string
          location: string | null
          notes: string | null
          original_start_at: string | null
          recurring_event_id: string | null
          rrule: string | null
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          calendar_id?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          end_at: string
          exdates?: string[]
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          original_start_at?: string | null
          recurring_event_id?: string | null
          rrule?: string | null
          start_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          calendar_id?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          end_at?: string
          exdates?: string[]
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          original_start_at?: string | null
          recurring_event_id?: string | null
          rrule?: string | null
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
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
          created_at: string
          google_email: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          refresh_token_enc: string
          sync_direction: string
          sync_token_by_calendar: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_email: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_enc: string
          sync_direction?: string
          sync_token_by_calendar?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_email?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_enc?: string
          sync_direction?: string
          sync_token_by_calendar?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_logs: {
        Row: {
          called_at: string
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input_summary: string | null
          status: string
          token_id: string | null
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          called_at?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_summary?: string | null
          status: string
          token_id?: string | null
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          called_at?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input_summary?: string | null
          status?: string
          token_id?: string | null
          tool?: string
          updated_at?: string
          user_id?: string
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
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: Json
          token_hash: string
          token_prefix: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: Json
          token_hash: string
          token_prefix?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: Json
          token_hash?: string
          token_prefix?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          channels: Json
          created_at: string
          default_reminder_minutes: number[]
          enabled_types: Json
          id: string
          push_subscriptions: Json
          quiet_end: string | null
          quiet_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: Json
          created_at?: string
          default_reminder_minutes?: number[]
          enabled_types?: Json
          id?: string
          push_subscriptions?: Json
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: Json
          created_at?: string
          default_reminder_minutes?: number[]
          enabled_types?: Json
          id?: string
          push_subscriptions?: Json
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          delivered_at: string | null
          id: string
          link: string | null
          read_at: string | null
          scheduled_at: string
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          scheduled_at?: string
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          delivered_at?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          scheduled_at?: string
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          start_screen: string
          temp_unit: string
          theme: string
          timezone: string
          updated_at: string
          user_id: string
          weather_location: Json | null
          week_start: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          start_screen?: string
          temp_unit?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id: string
          weather_location?: Json | null
          week_start?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          start_screen?: string
          temp_unit?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          weather_location?: Json | null
          week_start?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          created_at: string
          id: string
          storage_path: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          storage_path: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          storage_path?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
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
          account_id: string
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          cycle: string
          id: string
          last_run_date: string | null
          name: string
          next_run_date: string
          pay_day: number
          pay_month: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          cycle?: string
          id?: string
          last_run_date?: string | null
          name: string
          next_run_date: string
          pay_day: number
          pay_month?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          cycle?: string
          id?: string
          last_run_date?: string | null
          name?: string
          next_run_date?: string
          pay_day?: number
          pay_month?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_payments_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
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
          created_at: string
          detail: Json
          event_id: string | null
          id: string
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          event_id?: string | null
          id?: string
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          event_id?: string | null
          id?: string
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todo_items: {
        Row: {
          created_at: string
          done: boolean
          id: string
          position: number
          text: string
          todo_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          text: string
          todo_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          text?: string
          todo_id?: string
          updated_at?: string
          user_id?: string
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
          archived: boolean
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todo_tags: {
        Row: {
          created_at: string
          tag_id: string
          todo_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          todo_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          todo_id?: string
          updated_at?: string
          user_id?: string
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
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          due_date: string | null
          event_id: string | null
          id: string
          notes: string | null
          position: number
          priority: string
          project_id: string | null
          recurrence_rule: string | null
          recurrence_source_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_event_fk"
            columns: ["event_id", "user_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "user_id"]
          },
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
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          date: string
          id: string
          memo: string | null
          recurring_id: string | null
          source: string
          to_account_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          memo?: string | null
          recurring_id?: string | null
          source?: string
          to_account_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          date?: string
          id?: string
          memo?: string | null
          recurring_id?: string | null
          source?: string
          to_account_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
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
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
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
          created_at: string
          fetched_at: string
          id: string
          location_key: string
          payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string
          id?: string
          location_key: string
          payload: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          fetched_at?: string
          id?: string
          location_key?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          archived: boolean | null
          balance: number | null
          initial_balance: number | null
          name: string | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      budget_usage: {
        Args: { p_month?: string; p_user?: string }
        Returns: {
          budget: number
          category_id: string
          ratio: number
          spent: number
        }[]
      }
      complete_todo: {
        Args: {
          p_id: string
          p_next_due?: string
          p_next_rule?: string
          p_user?: string
        }
        Returns: string
      }
      convert_todo_to_event: {
        Args: {
          p_calendar_id?: string
          p_end_at: string
          p_start_at: string
          p_todo_id: string
        }
        Returns: {
          created: boolean
          event_id: string
        }[]
      }
      delete_my_account: { Args: never; Returns: undefined }
      invoke_notify: { Args: never; Returns: undefined }
      next_pay_date: {
        Args: {
          p_after: string
          p_cycle: string
          p_pay_day: number
          p_pay_month: number
        }
        Returns: string
      }
      pay_date_in: {
        Args: { p_day: number; p_month: number; p_year: number }
        Returns: string
      }
      purge_soft_deleted: { Args: never; Returns: undefined }
      run_recurring_payments: { Args: { p_today?: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
