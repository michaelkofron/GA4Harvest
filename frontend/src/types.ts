export interface Property {
  property_id: string
  property_name: string
  account_name: string
}

export interface MetaItem {
  api_name: string
  ui_name: string
}

export interface Metadata {
  metrics: MetaItem[]
  dimensions: MetaItem[]
}

export type QueryRow = Record<string, string | number | null | undefined>

export type FilterOperator = 'EXACT' | 'CONTAINS' | 'BEGINS_WITH' | 'ENDS_WITH' | 'REGEXP'

export interface DimensionFilter {
  dimension: string
  operator: FilterOperator
  value: string
}

export interface QueryHistoryItem {
  id: string
  timestamp: Date
  start_date: string
  end_date: string
  metrics: string[]
  dimensions: string[]
  filters: DimensionFilter[]
  match_mode: 'AND' | 'OR'
  properties_queried: number
  metric_totals?: Record<string, number>
  results?: QueryRow[]   // undefined until lazily loaded for cards from storage
}
