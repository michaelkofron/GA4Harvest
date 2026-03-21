import json
import time
from datetime import datetime, timezone
from pathlib import Path

from google.analytics.admin import AnalyticsAdminServiceClient
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange, Dimension, Metric, RunReportRequest,
    FilterExpression, FilterExpressionList, Filter,
)
from google.api_core.exceptions import ResourceExhausted


def list_properties() -> list[dict]:
    client = AnalyticsAdminServiceClient()
    results = []
    for account in client.list_account_summaries():
        for prop in account.property_summaries:
            results.append({
                "property_id": prop.property.split("/")[1],
                "property_name": prop.display_name,
                "account_name": account.display_name,
            })
    return results


def get_metadata(property_id: str) -> dict:
    client = BetaAnalyticsDataClient()
    metadata = client.get_metadata(name=f"properties/{property_id}/metadata")
    return {
        "metrics": [{"api_name": m.api_name, "ui_name": m.ui_name} for m in metadata.metrics],
        "dimensions": [{"api_name": d.api_name, "ui_name": d.ui_name} for d in metadata.dimensions],
    }


_OPERATOR_MAP = {
    "EXACT": Filter.StringFilter.MatchType.EXACT,
    "CONTAINS": Filter.StringFilter.MatchType.CONTAINS,
    "BEGINS_WITH": Filter.StringFilter.MatchType.BEGINS_WITH,
    "ENDS_WITH": Filter.StringFilter.MatchType.ENDS_WITH,
    "REGEXP": Filter.StringFilter.MatchType.FULL_REGEXP,
}


def _build_filter_expression(filters: list[dict], match_mode: str) -> FilterExpression | None:
    """Convert a list of filter dicts into a GA4 FilterExpression."""
    valid = [f for f in filters if f.get("dimension") and f.get("value")]
    if not valid:
        return None

    exprs = [
        FilterExpression(filter=Filter(
            field_name=f["dimension"],
            string_filter=Filter.StringFilter(
                match_type=_OPERATOR_MAP.get(f["operator"], Filter.StringFilter.MatchType.EXACT),
                value=f["value"],
            ),
        ))
        for f in valid
    ]

    if len(exprs) == 1:
        return exprs[0]

    expr_list = FilterExpressionList(expressions=exprs)
    if match_mode == "OR":
        return FilterExpression(or_group=expr_list)
    return FilterExpression(and_group=expr_list)


def _query_property(
    client: BetaAnalyticsDataClient,
    property_id: str,
    metrics: list[str],
    dimensions: list[str],
    start_date: str,
    end_date: str,
    base: dict,
    filters: list[dict] | None = None,
    match_mode: str = "AND",
) -> list[dict]:
    """Run a single property report with up to 3 retries on rate-limit errors."""
    filter_expr = _build_filter_expression(filters or [], match_mode)
    request = RunReportRequest(
        property=f"properties/{property_id}",
        metrics=[Metric(name=m) for m in metrics],
        dimensions=[Dimension(name=d) for d in dimensions],
        date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
        **({"dimension_filter": filter_expr} if filter_expr else {}),
    )
    for attempt in range(3):
        try:
            response = client.run_report(request)
            if not response.rows:
                row = dict(base)
                for d in dimensions:
                    row[d] = ""
                for m in metrics:
                    row[m] = 0
                return [row]

            rows = []
            for row in response.rows:
                row_data = dict(base)
                for i, d in enumerate(dimensions):
                    row_data[d] = row.dimension_values[i].value
                for i, m in enumerate(metrics):
                    row_data[m] = row.metric_values[i].value
                rows.append(row_data)
            return rows

        except ResourceExhausted:
            if attempt < 2:
                time.sleep(2 ** (attempt + 1))  # 2s then 4s
            else:
                return [{**base, "error": "Rate limit exceeded after 3 attempts. Try again later."}]
        except Exception as e:
            return [{**base, "error": str(e)}]

    return [{**base, "error": "Unknown error"}]


def stream_report(
    query_id: str,
    property_ids: list[str],
    metrics: list[str],
    dimensions: list[str],
    start_date: str,
    end_date: str,
    property_map: dict[str, dict],
    storage_path: Path,
    filters: list[dict] | None = None,
    match_mode: str = "AND",
):
    """
    SSE generator. Events:
      {"type": "progress", "done": N, "total": M, "current": "Property Name"}
      {"type": "result",   "data": {...row...}}
      {"type": "done",     "done": M, "total": M}
      {"type": "error",    "message": "..."}
    Saves full query JSON to storage_path when complete.
    """
    total = len(property_ids)
    all_results: list[dict] = []

    try:
        client = BetaAnalyticsDataClient()
        for i, property_id in enumerate(property_ids):
            prop_info = property_map.get(property_id, {})
            prop_name = prop_info.get("property_name", property_id)

            yield f"data: {json.dumps({'type': 'progress', 'done': i, 'total': total, 'current': prop_name})}\n\n"

            base = {
                "property_id": property_id,
                "property_name": prop_name,
                "account_name": prop_info.get("account_name", ""),
                "start_date": start_date,
                "end_date": end_date,
            }

            rows = _query_property(client, property_id, metrics, dimensions, start_date, end_date, base, filters, match_mode)
            for row in rows:
                all_results.append(row)
                yield f"data: {json.dumps({'type': 'result', 'data': row})}\n\n"

            if i < total - 1:
                time.sleep(0.05)  # polite pause between properties

        # Persist to disk
        query_data = {
            "id": query_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "start_date": start_date,
            "end_date": end_date,
            "metrics": metrics,
            "dimensions": dimensions,
            "filters": filters or [],
            "match_mode": match_mode,
            "properties_queried": len(property_ids),
            "results": all_results,
        }
        storage_path.write_text(json.dumps(query_data, indent=2))

        yield f"data: {json.dumps({'type': 'done', 'done': total, 'total': total})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
