from langgraph.checkpoint.memory import MemorySaver
from app.config import settings

checkpointer = MemorySaver()

try:
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg_pool import ConnectionPool

    # Build URL from individual settings if POSTGRES_URL is not set
    postgres_url = getattr(settings, "POSTGRES_URL", getattr(settings, "POSTGRES_URI", None))
    
    if not postgres_url:
        # Construct from individual env vars
        postgres_url = (
            f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
            f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        )

    if postgres_url:
        pool = ConnectionPool(conninfo=postgres_url, max_size=10, kwargs={"autocommit": True})
        checkpointer = PostgresSaver(pool)
        checkpointer.setup()
        print(f"LangGraph checkpointer: PostgresSaver connected to {settings.POSTGRES_HOST}")
except Exception as e:
    print(f"LangGraph checkpointer: Falling back to MemorySaver ({e})")