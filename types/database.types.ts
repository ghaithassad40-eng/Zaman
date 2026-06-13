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
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_courier: boolean
          is_default: boolean
          name: string
          name_ar: string | null
          notes: string | null
          opening_balance: number
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_courier?: boolean
          is_default?: boolean
          name: string
          name_ar?: string | null
          notes?: string | null
          opening_balance?: number
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_courier?: boolean
          is_default?: boolean
          name?: string
          name_ar?: string | null
          notes?: string | null
          opening_balance?: number
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: []
      }
      bank_statement_lines: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          id: string
          matched: boolean
          matched_txn_id: string | null
          txn_date: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          id?: string
          matched?: boolean
          matched_txn_id?: string | null
          txn_date: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["txn_direction"]
          id?: string
          matched?: boolean
          matched_txn_id?: string | null
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_txn_id_fkey"
            columns: ["matched_txn_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_price_changes: {
        Row: {
          id: string
          new_price: number
          old_price: number
          product_id: string
          run_id: string
        }
        Insert: {
          id?: string
          new_price: number
          old_price: number
          product_id: string
          run_id: string
        }
        Update: {
          id?: string
          new_price?: number
          old_price?: number
          product_id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_price_changes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_price_changes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_shop_availability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "bulk_price_changes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "bulk_price_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_price_runs: {
        Row: {
          applied_at: string
          applied_by: string | null
          id: string
          kind: string
          note: string | null
          products_count: number
          reversed_at: string | null
          reversed_by: string | null
          scope_label: string
          total_markdown: number
          value: number
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          kind: string
          note?: string | null
          products_count: number
          reversed_at?: string | null
          reversed_by?: string | null
          scope_label: string
          total_markdown: number
          value: number
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          id?: string
          kind?: string
          note?: string | null
          products_count?: number
          reversed_at?: string | null
          reversed_by?: string | null
          scope_label?: string
          total_markdown?: number
          value?: number
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          account_id: string
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          id: string
          note: string | null
          partner_id: string | null
          reconciled: boolean
          ref_id: string | null
          ref_table: string | null
          statement_line_id: string | null
          txn_date: string
        }
        Insert: {
          account_id: string
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          id?: string
          note?: string | null
          partner_id?: string | null
          reconciled?: boolean
          ref_id?: string | null
          ref_table?: string | null
          statement_line_id?: string | null
          txn_date?: string
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["txn_direction"]
          id?: string
          note?: string | null
          partner_id?: string | null
          reconciled?: boolean
          ref_id?: string | null
          ref_table?: string | null
          statement_line_id?: string | null
          txn_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_statement_line_id_fkey"
            columns: ["statement_line_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          address_ar: string | null
          auditor_firm: string | null
          auditor_license: string | null
          auditor_name: string | null
          auditor_name_ar: string | null
          auto_packaging: boolean
          commercial_reg: string | null
          created_at: string
          currency: string
          default_delivery_fee: number
          email: string | null
          facebook_url: string | null
          gst_rate: number
          id: string
          import_api_key: string | null
          instagram_handle: string | null
          logo_url: string | null
          name: string
          name_ar: string
          national_no: string | null
          opening_balance_date: string | null
          packaging_cost_per_order: number
          phone: string | null
          show_shop_prices: boolean
          tax_number: string | null
          terms_extra_ar: string | null
          terms_extra_en: string | null
          tiktok_url: string | null
          updated_at: string
          warranty_months: number
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          address_ar?: string | null
          auditor_firm?: string | null
          auditor_license?: string | null
          auditor_name?: string | null
          auditor_name_ar?: string | null
          auto_packaging?: boolean
          commercial_reg?: string | null
          created_at?: string
          currency?: string
          default_delivery_fee?: number
          email?: string | null
          facebook_url?: string | null
          gst_rate?: number
          id?: string
          import_api_key?: string | null
          instagram_handle?: string | null
          logo_url?: string | null
          name?: string
          name_ar?: string
          national_no?: string | null
          opening_balance_date?: string | null
          packaging_cost_per_order?: number
          phone?: string | null
          show_shop_prices?: boolean
          tax_number?: string | null
          terms_extra_ar?: string | null
          terms_extra_en?: string | null
          tiktok_url?: string | null
          updated_at?: string
          warranty_months?: number
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          address_ar?: string | null
          auditor_firm?: string | null
          auditor_license?: string | null
          auditor_name?: string | null
          auditor_name_ar?: string | null
          auto_packaging?: boolean
          commercial_reg?: string | null
          created_at?: string
          currency?: string
          default_delivery_fee?: number
          email?: string | null
          facebook_url?: string | null
          gst_rate?: number
          id?: string
          import_api_key?: string | null
          instagram_handle?: string | null
          logo_url?: string | null
          name?: string
          name_ar?: string
          national_no?: string | null
          opening_balance_date?: string | null
          packaging_cost_per_order?: number
          phone?: string | null
          show_shop_prices?: boolean
          tax_number?: string | null
          terms_extra_ar?: string | null
          terms_extra_en?: string | null
          tiktok_url?: string | null
          updated_at?: string
          warranty_months?: number
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          first_name: string | null
          id: string
          instagram_handle: string | null
          last_name: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          first_name?: string | null
          id?: string
          instagram_handle?: string | null
          last_name?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          first_name?: string | null
          id?: string
          instagram_handle?: string | null
          last_name?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      depreciation_postings: {
        Row: {
          amount: number
          asset_name: string
          asset_ref: string
          id: string
          note: string | null
          period_month: number
          period_year: number
          posted_at: string
          posted_by: string | null
        }
        Insert: {
          amount: number
          asset_name: string
          asset_ref: string
          id?: string
          note?: string | null
          period_month: number
          period_year: number
          posted_at?: string
          posted_by?: string | null
        }
        Update: {
          amount?: number
          asset_name?: string
          asset_ref?: string
          id?: string
          note?: string | null
          period_month?: number
          period_year?: number
          posted_at?: string
          posted_by?: string | null
        }
        Relationships: []
      }
      dividend_shares: {
        Row: {
          account_id: string | null
          amount: number
          cash_txn_id: string | null
          confirmed: boolean
          confirmed_by: string | null
          confirmed_on: string | null
          created_at: string
          dividend_id: string
          id: string
          note: string | null
          paid: boolean
          paid_by: string | null
          paid_on: string | null
          partner_id: string
          pct: number
        }
        Insert: {
          account_id?: string | null
          amount?: number
          cash_txn_id?: string | null
          confirmed?: boolean
          confirmed_by?: string | null
          confirmed_on?: string | null
          created_at?: string
          dividend_id: string
          id?: string
          note?: string | null
          paid?: boolean
          paid_by?: string | null
          paid_on?: string | null
          partner_id: string
          pct?: number
        }
        Update: {
          account_id?: string | null
          amount?: number
          cash_txn_id?: string | null
          confirmed?: boolean
          confirmed_by?: string | null
          confirmed_on?: string | null
          created_at?: string
          dividend_id?: string
          id?: string
          note?: string | null
          paid?: boolean
          paid_by?: string | null
          paid_on?: string | null
          partner_id?: string
          pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "dividend_shares_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividend_shares_dividend_id_fkey"
            columns: ["dividend_id"]
            isOneToOne: false
            referencedRelation: "dividends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dividend_shares_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      dividends: {
        Row: {
          created_at: string
          created_by: string | null
          declared_on: string
          id: string
          note: string | null
          status: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          declared_on?: string
          id?: string
          note?: string | null
          status?: string
          total_amount: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          declared_on?: string
          id?: string
          note?: string | null
          status?: string
          total_amount?: number
        }
        Relationships: []
      }
      doc_counters: {
        Row: {
          doc_type: string
          next_val: number
          prefix: string
        }
        Insert: {
          doc_type: string
          next_val?: number
          prefix: string
        }
        Update: {
          doc_type?: string
          next_val?: number
          prefix?: string
        }
        Relationships: []
      }
      fiscal_closes: {
        Row: {
          closed_at: string
          closed_by: string | null
          id: string
          label: string
          net_profit: number | null
          period_from: string
          period_to: string
          retained_earnings: number | null
          snapshot: Json | null
          status: string
          total_equity: number | null
        }
        Insert: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          label: string
          net_profit?: number | null
          period_from: string
          period_to: string
          retained_earnings?: number | null
          snapshot?: Json | null
          status?: string
          total_equity?: number | null
        }
        Update: {
          closed_at?: string
          closed_by?: string | null
          id?: string
          label?: string
          net_profit?: number | null
          period_from?: string
          period_to?: string
          retained_earnings?: number | null
          snapshot?: Json | null
          status?: string
          total_equity?: number | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          avg_unit_cost: number
          product_id: string
          qty_on_hand: number
          updated_at: string
        }
        Insert: {
          avg_unit_cost?: number
          product_id: string
          qty_on_hand?: number
          updated_at?: string
        }
        Update: {
          avg_unit_cost?: number
          product_id?: string
          qty_on_hand?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_shop_availability"
            referencedColumns: ["product_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          note: string | null
          product_id: string
          qty: number
          ref_id: string | null
          ref_table: string | null
          unit_cost: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          note?: string | null
          product_id: string
          qty: number
          ref_id?: string | null
          ref_table?: string | null
          unit_cost?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          note?: string | null
          product_id?: string
          qty?: number
          ref_id?: string | null
          ref_table?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_shop_availability"
            referencedColumns: ["product_id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          deleted_at: string | null
          delivery_fee: number
          discount: number
          due_date: string | null
          gst_amount: number
          gst_rate: number
          id: string
          invoice_no: string
          issue_date: string
          notes: string | null
          sale_id: string | null
          status: string
          subtotal: number
          tax_number: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          delivery_fee?: number
          discount?: number
          due_date?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_no: string
          issue_date?: string
          notes?: string | null
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax_number?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          delivery_fee?: number
          discount?: number
          due_date?: string | null
          gst_amount?: number
          gst_rate?: number
          id?: string
          invoice_no?: string
          issue_date?: string
          notes?: string | null
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax_number?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_audit_log: {
        Row: {
          action: string
          id: string
          meta: Json
          notification_id: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          id?: string
          meta?: Json
          notification_id: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          id?: string
          meta?: Json
          notification_id?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          kind: string
          payload: Json
          read_at: string | null
          ref_request_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          ref_request_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          ref_request_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ref_request_id_fkey"
            columns: ["ref_request_id"]
            isOneToOne: false
            referencedRelation: "product_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      packaging_assets: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_uses: number | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["asset_kind"]
          name: string
          name_ar: string | null
          notes: string | null
          purchase_cost: number
          qty_per_order: number
          qty_purchased: number
          qty_remaining: number | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_uses?: number | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["asset_kind"]
          name: string
          name_ar?: string | null
          notes?: string | null
          purchase_cost?: number
          qty_per_order?: number
          qty_purchased?: number
          qty_remaining?: number | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_uses?: number | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["asset_kind"]
          name?: string
          name_ar?: string | null
          notes?: string | null
          purchase_cost?: number
          qty_per_order?: number
          qty_purchased?: number
          qty_remaining?: number | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_admin: boolean
          name_ar: string | null
          ownership_pct: number
          phone: string | null
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_admin?: boolean
          name_ar?: string | null
          ownership_pct?: number
          phone?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_admin?: boolean
          name_ar?: string | null
          ownership_pct?: number
          phone?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_requests: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          notes: string | null
          product_id: string | null
          product_name_snapshot: string
          qty: number
          sale_id: string | null
          status: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name_snapshot: string
          qty?: number
          sale_id?: string | null
          status?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name_snapshot?: string
          qty?: number
          sale_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_shop_availability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_requests_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          comment: string | null
          created_at: string
          customer_name: string
          id: string
          product_id: string | null
          rating: number
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string
          customer_name: string
          id?: string
          product_id?: string | null
          rating: number
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          comment?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          product_id?: string | null
          rating?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_shop_availability"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          actual_cost: number | null
          avg_selling_price: number | null
          brand: string | null
          category: string | null
          color: string
          created_at: string
          created_by: string | null
          default_selling_price: number | null
          deleted_at: string | null
          description: string | null
          expected_selling_price: number | null
          feature: string | null
          gender: string | null
          historical_revenue: number
          historical_units_sold: number
          id: string
          image_urls: string[]
          is_active: boolean
          model: string | null
          name: string
          name_ar: string | null
          opening_qty: number
          sku: string
          source: string
          source_url: string | null
          updated_at: string
          updated_by: string | null
          visible_on_shop: boolean
          watch_type: string | null
        }
        Insert: {
          actual_cost?: number | null
          avg_selling_price?: number | null
          brand?: string | null
          category?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          default_selling_price?: number | null
          deleted_at?: string | null
          description?: string | null
          expected_selling_price?: number | null
          feature?: string | null
          gender?: string | null
          historical_revenue?: number
          historical_units_sold?: number
          id?: string
          image_urls?: string[]
          is_active?: boolean
          model?: string | null
          name: string
          name_ar?: string | null
          opening_qty?: number
          sku: string
          source?: string
          source_url?: string | null
          updated_at?: string
          updated_by?: string | null
          visible_on_shop?: boolean
          watch_type?: string | null
        }
        Update: {
          actual_cost?: number | null
          avg_selling_price?: number | null
          brand?: string | null
          category?: string | null
          color?: string
          created_at?: string
          created_by?: string | null
          default_selling_price?: number | null
          deleted_at?: string | null
          description?: string | null
          expected_selling_price?: number | null
          feature?: string | null
          gender?: string | null
          historical_revenue?: number
          historical_units_sold?: number
          id?: string
          image_urls?: string[]
          is_active?: boolean
          model?: string | null
          name?: string
          name_ar?: string | null
          opening_qty?: number
          sku?: string
          source?: string
          source_url?: string | null
          updated_at?: string
          updated_by?: string | null
          visible_on_shop?: boolean
          watch_type?: string | null
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          allocated_overhead: number
          asset_name: string | null
          created_at: string
          depreciation_start_date: string | null
          depreciation_years: number | null
          id: string
          image_url: string | null
          is_asset: boolean
          landed_unit_cost: number
          name: string | null
          product_id: string | null
          purchase_id: string
          qc_quality: boolean
          qc_repackage: boolean
          qc_working: boolean
          qty: number
          received: boolean
          salvage_value: number
          sku: string | null
          to_return: boolean
          unit_cost_jod: number
          unit_cost_src: number
        }
        Insert: {
          allocated_overhead?: number
          asset_name?: string | null
          created_at?: string
          depreciation_start_date?: string | null
          depreciation_years?: number | null
          id?: string
          image_url?: string | null
          is_asset?: boolean
          landed_unit_cost?: number
          name?: string | null
          product_id?: string | null
          purchase_id: string
          qc_quality?: boolean
          qc_repackage?: boolean
          qc_working?: boolean
          qty?: number
          received?: boolean
          salvage_value?: number
          sku?: string | null
          to_return?: boolean
          unit_cost_jod?: number
          unit_cost_src?: number
        }
        Update: {
          allocated_overhead?: number
          asset_name?: string | null
          created_at?: string
          depreciation_start_date?: string | null
          depreciation_years?: number | null
          id?: string
          image_url?: string | null
          is_asset?: boolean
          landed_unit_cost?: number
          name?: string | null
          product_id?: string | null
          purchase_id?: string
          qc_quality?: boolean
          qc_repackage?: boolean
          qc_working?: boolean
          qty?: number
          received?: boolean
          salvage_value?: number
          sku?: string | null
          to_return?: boolean
          unit_cost_jod?: number
          unit_cost_src?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_shop_availability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          asset_name: string | null
          clearance_cost: number
          created_at: string
          created_by: string | null
          customs_cost: number
          deleted_at: string | null
          depreciation_start_date: string | null
          depreciation_years: number | null
          doc_no: string | null
          fx_rate: number
          id: string
          is_asset: boolean
          items_total: number
          notes: string | null
          order_date: string
          other_cost: number
          paid_account_id: string | null
          raw_json: Json | null
          reference: string | null
          salvage_value: number
          shipping_cost: number
          source: string
          src_currency: string
          status: Database["public"]["Enums"]["purchase_status"]
          total_landed: number
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          asset_name?: string | null
          clearance_cost?: number
          created_at?: string
          created_by?: string | null
          customs_cost?: number
          deleted_at?: string | null
          depreciation_start_date?: string | null
          depreciation_years?: number | null
          doc_no?: string | null
          fx_rate?: number
          id?: string
          is_asset?: boolean
          items_total?: number
          notes?: string | null
          order_date?: string
          other_cost?: number
          paid_account_id?: string | null
          raw_json?: Json | null
          reference?: string | null
          salvage_value?: number
          shipping_cost?: number
          source?: string
          src_currency?: string
          status?: Database["public"]["Enums"]["purchase_status"]
          total_landed?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          asset_name?: string | null
          clearance_cost?: number
          created_at?: string
          created_by?: string | null
          customs_cost?: number
          deleted_at?: string | null
          depreciation_start_date?: string | null
          depreciation_years?: number | null
          doc_no?: string | null
          fx_rate?: number
          id?: string
          is_asset?: boolean
          items_total?: number
          notes?: string | null
          order_date?: string
          other_cost?: number
          paid_account_id?: string | null
          raw_json?: Json | null
          reference?: string | null
          salvage_value?: number
          shipping_cost?: number
          source?: string
          src_currency?: string
          status?: Database["public"]["Enums"]["purchase_status"]
          total_landed?: number
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_paid_account_id_fkey"
            columns: ["paid_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          description: string | null
          discount: number
          id: string
          line_total: number
          product_id: string | null
          qty: number
          sale_id: string
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          qty?: number
          sale_id: string
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount?: number
          id?: string
          line_total?: number
          product_id?: string | null
          qty?: number
          sale_id?: string
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_shop_availability"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_packaging: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          qty: number
          sale_id: string
          unit_cost: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          qty?: number
          sale_id: string
          unit_cost?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          qty?: number
          sale_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_packaging_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "packaging_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_packaging_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          deleted_at: string | null
          delivery_billed: number
          delivery_fee: number
          delivery_vendor_id: string | null
          discount: number
          fulfillment_stage: number
          gross_profit: number
          gst_amount: number
          gst_rate: number
          id: string
          notes: string | null
          packaging_cost: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          return_stage: number
          sale_date: string
          sale_no: string
          sold_by: string | null
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total: number
          total_cost: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          delivery_billed?: number
          delivery_fee?: number
          delivery_vendor_id?: string | null
          discount?: number
          fulfillment_stage?: number
          gross_profit?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          notes?: string | null
          packaging_cost?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          return_stage?: number
          sale_date?: string
          sale_no: string
          sold_by?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
          total_cost?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          delivery_billed?: number
          delivery_fee?: number
          delivery_vendor_id?: string | null
          discount?: number
          fulfillment_stage?: number
          gross_profit?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          notes?: string | null
          packaging_cost?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          return_stage?: number
          sale_date?: string
          sale_no?: string
          sold_by?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
          total_cost?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_delivery_vendor_id_fkey"
            columns: ["delivery_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_transactions: {
        Row: {
          account_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          credit: number
          debit: number
          id: string
          note: string | null
          ref_id: string | null
          ref_table: string | null
          txn_date: string
          vendor_id: string
        }
        Insert: {
          account_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          id?: string
          note?: string | null
          ref_id?: string | null
          ref_table?: string | null
          txn_date?: string
          vendor_id: string
        }
        Update: {
          account_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          id?: string
          note?: string | null
          ref_id?: string | null
          ref_table?: string | null
          txn_date?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          is_default_delivery: boolean
          kind: Database["public"]["Enums"]["vendor_kind"]
          name: string
          name_ar: string | null
          notes: string | null
          opening_balance: number
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_default_delivery?: boolean
          kind?: Database["public"]["Enums"]["vendor_kind"]
          name: string
          name_ar?: string | null
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_default_delivery?: boolean
          kind?: Database["public"]["Enums"]["vendor_kind"]
          name?: string
          name_ar?: string | null
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_assets: {
        Row: {
          accumulated_depreciation: number | null
          book_value: number | null
          cost: number | null
          id: string | null
          monthly_depreciation: number | null
          months_elapsed: number | null
          months_total: number | null
          name: string | null
          purchase_id: string | null
          salvage_value: number | null
          start_date: string | null
          vendor_id: string | null
          vendor_name: string | null
          years: number | null
        }
        Relationships: []
      }
      v_shop_availability: {
        Row: {
          available: number | null
          on_hand: number | null
          product_id: string | null
          reserved: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_inventory: {
        Args: { p_new_qty: number; p_note?: string; p_product_id: string }
        Returns: undefined
      }
      apply_bulk_discount: {
        Args: {
          p_brand?: string
          p_gender?: string
          p_kind: string
          p_note?: string
          p_value: number
          p_watch_type?: string
        }
        Returns: {
          products_count: number
          run_id: string
          total_markdown: number
        }[]
      }
      assign_delivery_vendor: {
        Args: { p_sale_id: string; p_vendor_id: string }
        Returns: undefined
      }
      claim_partner_seat: {
        Args: { p_full_name: string; p_name_ar?: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          is_admin: boolean
          name_ar: string | null
          ownership_pct: number
          phone: string | null
          role: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "partners"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_fiscal_year: {
        Args: { p_from: string; p_label: string; p_to: string }
        Returns: string
      }
      confirm_dividend_share: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      confirm_sale: { Args: { p_sale_id: string }; Returns: undefined }
      convert_historicals_to_sales: {
        Args: { p_date: string }
        Returns: {
          converted: number
          profit: number
          revenue: number
          units: number
        }[]
      }
      declare_dividend: {
        Args: { p_date: string; p_note: string; p_total: number }
        Returns: string
      }
      default_account_id: { Args: never; Returns: string }
      default_delivery_vendor: { Args: never; Returns: string }
      delete_dividend: { Args: { p_id: string }; Returns: undefined }
      fan_out_request_email: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      finalize_receiving: {
        Args: { p_purchase_id: string }
        Returns: undefined
      }
      get_breakeven: { Args: { p_from: string; p_to: string }; Returns: Json }
      get_financials: { Args: { p_from: string; p_to: string }; Returns: Json }
      is_admin_partner: { Args: never; Returns: boolean }
      is_partner: { Args: never; Returns: boolean }
      issue_to_partner: {
        Args: {
          p_account_id: string
          p_date: string
          p_items: Json
          p_note?: string
          p_partner_id: string
        }
        Returns: string
      }
      mark_notification: {
        Args: { p_action: string; p_id: string }
        Returns: undefined
      }
      match_bank_line: {
        Args: { p_line: string; p_txn: string }
        Returns: undefined
      }
      next_doc_no: { Args: { p_type: string }; Returns: string }
      pack_sale: {
        Args: { p_items: Json; p_sale_id: string }
        Returns: undefined
      }
      pay_dividend_share: {
        Args: { p_account_id: string; p_date: string; p_share_id: string }
        Returns: undefined
      }
      process_depreciation: {
        Args: { p_month: number; p_year: number }
        Returns: {
          posted_count: number
          skipped_count: number
          total_amount: number
        }[]
      }
      receive_purchase: { Args: { p_purchase_id: string }; Returns: undefined }
      recompute_inventory: {
        Args: { p_product_id?: string }
        Returns: {
          after_qty: number
          before_qty: number
          product_id: string
          sku: string
        }[]
      }
      recompute_packaging_cost: { Args: never; Returns: undefined }
      reopen_fiscal_year: { Args: { p_id: string }; Returns: undefined }
      return_sale: { Args: { p_sale_id: string }; Returns: undefined }
      reverse_purchase: { Args: { p_purchase_id: string }; Returns: undefined }
      revert_bulk_discount: {
        Args: { p_run_id: string }
        Returns: {
          restored_count: number
        }[]
      }
      set_txn_reconciled: {
        Args: { p_txn: string; p_value: boolean }
        Returns: undefined
      }
      submit_product_request: {
        Args: {
          p_address?: string
          p_email?: string
          p_name: string
          p_notes?: string
          p_phone: string
          p_product_id: string
          p_qty: number
        }
        Returns: string
      }
      transfer_between_accounts: {
        Args: {
          p_amount: number
          p_date: string
          p_from_account: string
          p_note?: string
          p_to_account: string
        }
        Returns: undefined
      }
      unmatch_bank_line: { Args: { p_line: string }; Returns: undefined }
    }
    Enums: {
      account_type: "cash" | "bank" | "wallet" | "equity"
      asset_kind: "consumable" | "equipment"
      payment_status: "unpaid" | "partial" | "paid" | "refunded"
      purchase_status: "ordered" | "shipped" | "received" | "cancelled"
      sale_status:
        | "draft"
        | "confirmed"
        | "packed"
        | "delivered"
        | "completed"
        | "cancelled"
        | "returned"
      txn_direction: "in" | "out"
      vendor_kind: "delivery" | "service" | "supplier" | "other"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      account_type: ["cash", "bank", "wallet", "equity"],
      asset_kind: ["consumable", "equipment"],
      payment_status: ["unpaid", "partial", "paid", "refunded"],
      purchase_status: ["ordered", "shipped", "received", "cancelled"],
      sale_status: [
        "draft",
        "confirmed",
        "packed",
        "delivered",
        "completed",
        "cancelled",
        "returned",
      ],
      txn_direction: ["in", "out"],
      vendor_kind: ["delivery", "service", "supplier", "other"],
    },
  },
} as const
