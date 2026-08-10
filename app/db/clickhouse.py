import clickhouse_connect
from app.config import settings

def get_clickhouse_client():
    """
    Returns an active ClickHouse client connection based on env settings.
    Handles both local HTTP connections and ClickHouse Cloud TLS connections.
    """
    client = clickhouse_connect.get_client(
        host=settings.CLICKHOUSE_HOST,
        port=settings.CLICKHOUSE_PORT,
        username=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD,
        database=settings.CLICKHOUSE_DATABASE,
        secure=settings.CLICKHOUSE_SECURE
    )
    return client

def init_clickhouse():
    """Initializes tables using schema SQL."""
    client = get_clickhouse_client()
    
    ## read script
    with open("app/db/clickhouse_schema.sql", "r") as f:
        schema_sql = f.read()
    
    # Execute commands
    commands = [cmd.strip() for cmd in schema_sql.split(";") if cmd.strip()]
    for cmd in commands:
        client.command(cmd)
    
    print("Click House Schema created...")

if __name__ == "__main__":
    init_clickhouse()