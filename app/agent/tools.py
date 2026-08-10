from typing import Dict, Any, List
from langchain_core.tools import tool
from app.db.clickhouse import get_clickhouse_client

@tool
def execute_clickhouse_query(query: str) -> Dict[str, Any]:
    """
    Executes a SELECT query against the ClickHouse database and returns results.
    Only SELECT/SHOW statements are allowed for security.
    """
    clean_query = query.strip()
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