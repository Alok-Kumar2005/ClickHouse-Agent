from langgraph.checkpoint.memory import MemorySaver
from app.config import settings

checkpointer = MemorySaver()

try:
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg_pool import ConnectionPool

    postgres_url = getattr(settings, "POSTGRES_URL", getattr(settings, "POSTGRES_URI", None))

    if postgres_url:
        pool = ConnectionPool(conninfo=postgres_url, max_size=10, kwargs={"autocommit": True})
        checkpointer = PostgresSaver(pool)
except Exception as e:
    pass