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
  public: {
    Tables: {
      automation_settings: {
        Row: {
          account_ids: string[]
          country: string
          created_at: string
          custom_slots: string[]
          days_of_week: number[]
          emergency_stop: boolean
          emergency_stopped_at: string | null
          frequency: string
          platforms: string[]
          publish_times: string[]
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_ids?: string[]
          country?: string
          created_at?: string
          custom_slots?: string[]
          days_of_week?: number[]
          emergency_stop?: boolean
          emergency_stopped_at?: string | null
          frequency?: string
          platforms?: string[]
          publish_times?: string[]
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_ids?: string[]
          country?: string
          created_at?: string
          custom_slots?: string[]
          days_of_week?: number[]
          emergency_stop?: boolean
          emergency_stopped_at?: string | null
          frequency?: string
          platforms?: string[]
          publish_times?: string[]
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      characters: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      job_locks: {
        Row: {
          locked_until: string
          name: string
        }
        Insert: {
          locked_until: string
          name: string
        }
        Update: {
          locked_until?: string
          name?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          platform: string
          reconnect_account_id: string | null
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          platform: string
          reconnect_account_id?: string | null
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          platform?: string
          reconnect_account_id?: string | null
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_steps: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          model: string | null
          output: string | null
          project_id: string
          started_at: string | null
          status: string
          step_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          output?: string | null
          project_id: string
          started_at?: string | null
          status?: string
          step_key: string
          user_id?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          model?: string | null
          output?: string | null
          project_id?: string
          started_at?: string | null
          status?: string
          step_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_steps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          collected_at: string
          comments: number | null
          id: string
          likes: number | null
          post_id: string
          shares: number | null
          user_id: string
          views: number | null
        }
        Insert: {
          collected_at?: string
          comments?: number | null
          id?: string
          likes?: number | null
          post_id: string
          shares?: number | null
          user_id?: string
          views?: number | null
        }
        Update: {
          collected_at?: string
          comments?: number | null
          id?: string
          likes?: number | null
          post_id?: string
          shares?: number | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      production_history: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          id?: string
          project_id: string
          user_id?: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      project_social_accounts: {
        Row: {
          account_id: string
          created_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          project_id: string
          user_id?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_social_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_social_accounts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          aspect_ratio: string
          auto_publish: boolean
          created_at: string
          current_stage: string | null
          id: string
          idea: string
          language: string
          last_error: string | null
          reference_notes: string | null
          skill_version_id: string | null
          status: string
          target_audience: string | null
          target_duration_seconds: number
          target_platform: string | null
          title: string
          topic: string | null
          updated_at: string
          user_id: string
          video_requirements: string | null
          visual_style: string | null
        }
        Insert: {
          aspect_ratio?: string
          auto_publish?: boolean
          created_at?: string
          current_stage?: string | null
          id?: string
          idea: string
          language?: string
          last_error?: string | null
          reference_notes?: string | null
          skill_version_id?: string | null
          status?: string
          target_audience?: string | null
          target_duration_seconds?: number
          target_platform?: string | null
          title: string
          topic?: string | null
          updated_at?: string
          user_id?: string
          video_requirements?: string | null
          visual_style?: string | null
        }
        Update: {
          aspect_ratio?: string
          auto_publish?: boolean
          created_at?: string
          current_stage?: string | null
          id?: string
          idea?: string
          language?: string
          last_error?: string | null
          reference_notes?: string | null
          skill_version_id?: string | null
          status?: string
          target_audience?: string | null
          target_duration_seconds?: number
          target_platform?: string | null
          title?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
          video_requirements?: string | null
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_skill_version_id_fkey"
            columns: ["skill_version_id"]
            isOneToOne: false
            referencedRelation: "skill_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          attempts: number
          automated: boolean
          caption: string | null
          created_at: string
          external_post_id: string | null
          hashtags: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          next_attempt_at: string | null
          options: Json
          platform: string
          project_id: string | null
          published_at: string | null
          published_url: string | null
          scheduled_for: string | null
          social_account_id: string | null
          status: string
          status_detail: string | null
          title: string | null
          updated_at: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          attempts?: number
          automated?: boolean
          caption?: string | null
          created_at?: string
          external_post_id?: string | null
          hashtags?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          options?: Json
          platform: string
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          scheduled_for?: string | null
          social_account_id?: string | null
          status?: string
          status_detail?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
        }
        Update: {
          attempts?: number
          automated?: boolean
          caption?: string | null
          created_at?: string
          external_post_id?: string | null
          hashtags?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          options?: Json
          platform?: string
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          scheduled_for?: string | null
          social_account_id?: string | null
          status?: string
          status_detail?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_versions: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          name: string | null
          notes: string | null
          size_bytes: number
          skill_id: string
          status: string
          storage_path: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          name?: string | null
          notes?: string | null
          size_bytes?: number
          skill_id: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          name?: string | null
          notes?: string | null
          size_bytes?: number
          skill_id?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "skill_versions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          active_version_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_active_fk"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "skill_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          account_name: string | null
          avatar_url: string | null
          created_at: string
          external_id: string | null
          id: string
          last_error: string | null
          last_published_at: string | null
          last_published_title: string | null
          last_sync_at: string | null
          platform: string
          scopes: string[]
          status: string
          token_expires_at: string | null
          token_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          avatar_url?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_published_at?: string | null
          last_published_title?: string | null
          last_sync_at?: string | null
          platform: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          token_status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_name?: string | null
          avatar_url?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_published_at?: string | null
          last_published_title?: string | null
          last_sync_at?: string | null
          platform?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          token_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      social_tokens: {
        Row: {
          access_token_enc: string
          account_id: string
          refresh_token_enc: string | null
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          account_id: string
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          account_id?: string
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboards: {
        Row: {
          content: string
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          project_id: string
          user_id?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyboards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_assets: {
        Row: {
          created_at: string
          id: string
          kind: string
          metadata: Json
          project_id: string
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          project_id: string
          url?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          project_id?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_audio_tracks: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          project_id: string
          start_s: number
          url: string | null
          user_id: string
          volume: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label: string
          project_id: string
          start_s?: number
          url?: string | null
          user_id?: string
          volume?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          project_id?: string
          start_s?: number
          url?: string | null
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_audio_tracks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_clips: {
        Row: {
          created_at: string
          from_s: number
          id: string
          is_deleted: boolean
          position: number
          project_id: string
          prompt: string | null
          provider_job_id: string | null
          source: string
          status: string
          to_s: number
          transition: string
          trim_end: number
          trim_start: number
          updated_at: string
          user_id: string
          video_url: string | null
          volume: number
        }
        Insert: {
          created_at?: string
          from_s?: number
          id?: string
          is_deleted?: boolean
          position?: number
          project_id: string
          prompt?: string | null
          provider_job_id?: string | null
          source?: string
          status?: string
          to_s?: number
          transition?: string
          trim_end?: number
          trim_start?: number
          updated_at?: string
          user_id?: string
          video_url?: string | null
          volume?: number
        }
        Update: {
          created_at?: string
          from_s?: number
          id?: string
          is_deleted?: boolean
          position?: number
          project_id?: string
          prompt?: string | null
          provider_job_id?: string | null
          source?: string
          status?: string
          to_s?: number
          transition?: string
          trim_end?: number
          trim_start?: number
          updated_at?: string
          user_id?: string
          video_url?: string | null
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_reviews: {
        Row: {
          checks: Json
          created_at: string
          failed_segments: Json
          id: string
          kind: string
          project_id: string
          recommendations: Json
          report: string | null
          user_id: string
        }
        Insert: {
          checks?: Json
          created_at?: string
          failed_segments?: Json
          id?: string
          kind?: string
          project_id: string
          recommendations?: Json
          report?: string | null
          user_id?: string
        }
        Update: {
          checks?: Json
          created_at?: string
          failed_segments?: Json
          id?: string
          kind?: string
          project_id?: string
          recommendations?: Json
          report?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          provider: string | null
          provider_job_id: string | null
          status: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          provider?: string | null
          provider_job_id?: string | null
          status?: string
          user_id?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          provider?: string | null
          provider_job_id?: string | null
          status?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_job_lock: {
        Args: { _name: string; _seconds: number }
        Returns: boolean
      }
      activate_skill_version: {
        Args: { _version_id: string }
        Returns: undefined
      }
      claim_scheduled_post: {
        Args: { _id: string; _seconds: number }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      release_job_lock: { Args: { _name: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
