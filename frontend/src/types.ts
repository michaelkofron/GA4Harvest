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

export type Granularity = 'day' | 'week' | 'month' | 'year'

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: 'Day', week: 'Week', month: 'Month', year: 'Year',
}

export const GRANULARITY_CARD_LABELS: Record<Granularity, string> = {
  day: 'day-by-day', week: 'week-by-week', month: 'month-by-month', year: 'year-by-year',
}

// The GA4 dimension that produces each granularity
export const GRANULARITY_DIMENSION: Record<Granularity, string> = {
  day: 'date', week: 'yearWeek', month: 'yearMonth', year: 'year',
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
  comparison?: { start_date: string; end_date: string }
  time_series?: { granularity: Granularity }
  properties_queried: number
  results?: QueryRow[]   // undefined until lazily loaded for cards from storage
}
