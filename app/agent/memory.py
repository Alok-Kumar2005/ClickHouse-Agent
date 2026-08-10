from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg2
from app.config import settings

def get_checkpointer():
    try:
        connection_kwargs = {
            "autocommit": True,
            "prepare_threshold": 0,
        }
        conn_str = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
        
        # Test connection
        conn = psycopg2.connect(conn_str)
        conn.close()
        
        print("LangGraph Checkpointer: Using PostgreSQL Saver")
        return PostgresSaver.from_conn_string(conn_str)
    except Exception as e:
        print(f"Postgres Checkpointer unavailable ({e}). Falling back to MemorySaver.")
        return MemorySaver()

checkpointer = get_checkpointer()