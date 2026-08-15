import re
from typing import Dict, Any, List
from langchain_core.tools import tool
from app.db.clickhouse import get_clickhouse_client

def enforce_tenant_isolation(query: str, user_id: str) -> str:
    """
    Programmatic Guardrail: Inspects query, normalizes custom_user_sales references, 
    and ensures that queries to user_datasets strictly filter by the active user_id.
    """
    if not user_id:
        return query

    # Replace references to custom_user_sales with user_datasets
    query = re.sub(r'\bcustom_user_sales\b', 'user_datasets', query, flags=re.IGNORECASE)

    # If the query does not target user_datasets, return as is
    if 'user_datasets' not in query.lower():
        return query

    # Pattern to check if correct user_id filter exists (with optional backticks)
    user_id_pattern = rf"`?user_id`?\s*=\s*['\"]{re.escape(user_id)}['\"]"
    if re.search(user_id_pattern, query):
        return query

    # If a filter on user_id exists but has a different value (or pattern), overwrite it
    generic_user_id_pattern = r"\b`?user_id`?\s*=\s*['\"][^'\"]*['\"]"
    if re.search(generic_user_id_pattern, query):
        query = re.sub(generic_user_id_pattern, f"user_id = '{user_id}'", query)
        return query

    # If user_id is not in the query at all, append it
    # We must insert it into the WHERE clause
    where_match = re.search(r'\bwhere\b', query, re.IGNORECASE)
    if where_match:
        # Inject right after WHERE
        where_pos = where_match.end()
        query = query[:where_pos] + f" user_id = '{user_id}' AND" + query[where_pos:]
    else:
        # No WHERE clause. Find where to inject WHERE user_id = '<user_id>'
        clause_keywords = [
            r'\bgroup\s+by\b', r'\bhaving\b', r'\border\s+by\b', 
            r'\blimit\b', r'\bsettings\b', r'\bformat\b', r'\bunion\b'
        ]
        insert_pos = len(query)
        for kw in clause_keywords:
            kw_match = re.search(kw, query, re.IGNORECASE)
            if kw_match:
                insert_pos = min(insert_pos, kw_match.start())
        
        query = query[:insert_pos].rstrip() + f" WHERE user_id = '{user_id}' " + query[insert_pos:]

    return query

@tool
def execute_clickhouse_query(query: str, user_id: str = "") -> Dict[str, Any]:
    """
    Executes a SELECT query against the ClickHouse database and returns results.
    Only SELECT/SHOW statements are allowed for security.
    """
    clean_query = query.strip()
    
    # Enforce tenant isolation guardrail
    if user_id:
        clean_query = enforce_tenant_isolation(clean_query, user_id)
    elif 'user_datasets' in clean_query.lower():
        return {"error": "Security restriction: Active user session is required to query user datasets."}
        
    if not clean_query.upper().startswith(("SELECT", "SHOW", "WITH", "DESCRIBE")):
        return {"error": "Security restriction: Only read-only queries (SELECT, SHOW, DESCRIBE) are permitted."}
    
    try:
        client = get_clickhouse_client()
        result = client.query(clean_query)
        
        # Format results as key-value dictionaries using column names
        column_names = result.column_names
        formatted_rows = [dict(zip(column_names, row)) for row in result.result_rows]
        
        return {
            "row_count": len(formatted_rows),
            "columns": column_names,
            "data": formatted_rows
        }
    except Exception as e:
        return {"error": str(e)}

@tool
def get_clickhouse_schema() -> str:
    """Returns the DDL schema of all active ClickHouse tables."""
    return """
    1. Table: ticket_sales
       Columns: ticket_id (String), movie_id (String), movie_title (String), theater_id (String), screen_number (UInt8), ticket_price (Float32), discount_applied (Float32), timestamp (DateTime)
    
    2. Table: audience_sentiment
       Columns: movie_id (String), source (String), sentiment_score (Float32), post_volume (UInt32), timestamp (DateTime)
    
    3. Table: theater_occupancy
       Columns: theater_id (String), theater_name (String), movie_id (String), total_seats (UInt16), booked_seats (UInt16), occupancy_rate (Float32), show_time (DateTime)
    """