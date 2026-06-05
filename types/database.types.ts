export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          ref_id: string | null
          ref_table: string | null
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
          ref_id?: string | null
          ref_table?: string | null
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
          ref_id?: string | null
          ref_table?: string | null
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
        ]
      }
      company_settings: {
        Row: {
          address: string | null
          address_ar: string | null
          auto_packaging: boolean
          created_at: string
          currency: string
          default_delivery_fee: number
          email: string | null
          gst_rate: number
          id: string
          import_api_key: string | null
          instagram_handle: string | null
          logo_url: string | null
          name: string
          name_ar: string
          national_no: string | null
          packaging_cost_per_order: number
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          auto_packaging?: boolean
          gst_rate?: number
          name?: string
          name_ar?: string
          packaging_cost_per_order?: number
          [k: string]: unknown
        }
        Update: {
          auto_packaging?: boolean
          gst_rate?: number
          packaging_cost_per_order?: number
          tax_number?: string | null
          [k: string]: unknown
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
          name?: string
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          instagram_handle?: string | null
          city?: string | null
          address?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          name?: string
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          instagram_handle?: string | null
          city?: string | null
          address?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      doc_counters: {
        Row: { doc_type: string; next_val: number; prefix: string }
        Insert: { doc_type: string; next_val?: number; prefix: string }
        Update: { doc_type?: string; next_val?: number; prefix?: string }
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
          movement_type: string
          product_id: string
          qty: number
          unit_cost?: number
          ref_table?: string | null
          ref_id?: string | null
          note?: string | null
          created_by?: string | null
        }
        Update: { [k: string]: unknown }
        Relationships: []
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
          invoice_no: string
          sale_id?: string | null
          customer_id?: string | null
          subtotal?: number
          discount?: number
          delivery_fee?: number
          gst_rate?: number
          gst_amount?: number
          total?: number
          tax_number?: string | null
          status?: string
          created_by?: string | null
        }
        Update: { status?: string; deleted_at?: string | null }
        Relationships: []
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
          updated_at: string
        }
        Insert: {
          name: string
          name_ar?: string | null
          kind?: Database["public"]["Enums"]["asset_kind"]
          category?: string | null
          purchase_cost?: number
          qty_purchased?: number
          qty_remaining?: number | null
          expected_uses?: number | null
          qty_per_order?: number
          is_active?: boolean
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          name?: string
          purchase_cost?: number
          qty_purchased?: number
          qty_remaining?: number | null
          expected_uses?: number | null
          qty_per_order?: number
          is_active?: boolean
          deleted_at?: string | null
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
          full_name: string
          name_ar?: string | null
          email?: string | null
          phone?: string | null
          ownership_pct?: number
          user_id?: string | null
        }
        Update: { full_name?: string; deleted_at?: string | null }
        Relationships: []
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          created_by: string | null
          default_selling_price: number | null
          expected_selling_price: number | null
          historical_units_sold: number
          historical_revenue: number
          opening_qty: number
          actual_cost: number | null
          avg_selling_price: number | null
          deleted_at: string | null
          description: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          name: string
          name_ar: string | null
          sku: string
          source: string
          source_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          sku: string
          name: string
          name_ar?: string | null
          brand?: string | null
          category?: string | null
          description?: string | null
          source?: string
          source_url?: string | null
          image_urls?: string[]
          default_selling_price?: number | null
          expected_selling_price?: number | null
          opening_qty?: number
          actual_cost?: number | null
          avg_selling_price?: number | null
          historical_units_sold?: number
          historical_revenue?: number
          created_by?: string | null
        }
        Update: {
          sku?: string
          name?: string
          name_ar?: string | null
          brand?: string | null
          description?: string | null
          source_url?: string | null
          default_selling_price?: number | null
          expected_selling_price?: number | null
          opening_qty?: number
          actual_cost?: number | null
          avg_selling_price?: number | null
          historical_units_sold?: number
          historical_revenue?: number
          image_urls?: string[]
          is_active?: boolean
          updated_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          allocated_overhead: number
          created_at: string
          id: string
          image_url: string | null
          landed_unit_cost: number
          name: string | null
          product_id: string | null
          purchase_id: string
          qty: number
          sku: string | null
          unit_cost_jod: number
          unit_cost_src: number
          received: boolean
          qc_quality: boolean
          qc_working: boolean
          qc_repackage: boolean
          to_return: boolean
        }
        Insert: {
          purchase_id: string
          product_id?: string | null
          sku?: string | null
          name?: string | null
          qty?: number
          unit_cost_src?: number
          unit_cost_jod?: number
          allocated_overhead?: number
          landed_unit_cost?: number
        }
        Update: { [k: string]: unknown }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
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
          clearance_cost: number
          created_at: string
          created_by: string | null
          customs_cost: number
          deleted_at: string | null
          doc_no: string | null
          fx_rate: number
          id: string
          items_total: number
          notes: string | null
          order_date: string
          other_cost: number
          raw_json: Json | null
          reference: string | null
          shipping_cost: number
          source: string
          src_currency: string
          status: Database["public"]["Enums"]["purchase_status"]
          total_landed: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          doc_no?: string | null
          reference?: string | null
          source?: string
          order_date?: string
          src_currency?: string
          fx_rate?: number
          items_total?: number
          shipping_cost?: number
          customs_cost?: number
          clearance_cost?: number
          other_cost?: number
          total_landed?: number
          status?: Database["public"]["Enums"]["purchase_status"]
          created_by?: string | null
        }
        Update: { status?: Database["public"]["Enums"]["purchase_status"] }
        Relationships: []
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
          sale_id: string
          product_id?: string | null
          description?: string | null
          qty?: number
          unit_cost?: number
          unit_price?: number
          discount?: number
          line_total?: number
        }
        Update: { [k: string]: unknown }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
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
          discount: number
          gross_profit: number
          gst_amount: number
          gst_rate: number
          id: string
          notes: string | null
          packaging_cost: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          sale_date: string
          sale_no: string
          sold_by: string | null
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total: number
          total_cost: number
          fulfillment_stage: number
          return_stage: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          sale_no: string
          customer_id?: string | null
          sold_by?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          subtotal?: number
          discount?: number
          delivery_fee?: number
          delivery_billed?: number
          gst_rate?: number
          gst_amount?: number
          total?: number
          packaging_cost?: number
          created_by?: string | null
        }
        Update: {
          status?: Database["public"]["Enums"]["sale_status"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          fulfillment_stage?: number
          return_stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      adjust_inventory: {
        Args: { p_product_id: string; p_new_qty: number; p_note?: string }
        Returns: undefined
      }
      claim_partner_seat: {
        Args: { p_full_name: string; p_name_ar?: string }
        Returns: unknown
      }
      confirm_sale: { Args: { p_sale_id: string }; Returns: undefined }
      default_account_id: { Args: never; Returns: string }
      finalize_receiving: { Args: { p_purchase_id: string }; Returns: undefined }
      get_financials: { Args: { p_from: string; p_to: string }; Returns: Json }
      is_partner: { Args: never; Returns: boolean }
      next_doc_no: { Args: { p_type: string }; Returns: string }
      receive_purchase: { Args: { p_purchase_id: string }; Returns: undefined }
      return_sale: { Args: { p_sale_id: string }; Returns: undefined }
      recompute_packaging_cost: { Args: never; Returns: undefined }
    }
    Enums: {
      account_type: "cash" | "bank" | "wallet"
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
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]
export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T]
