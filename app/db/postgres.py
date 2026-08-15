"""
app/db/postgres.py — PostgreSQL connection pool and persistence layer
for users and threads. Replaces the in-memory USERS_DB / THREADS_DB dicts.
"""
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from app.config import settings


def _build_postgres_url() -> str:
    """Construct a PostgreSQL DSN from individual settings."""
    return (
        f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{settings.POSTGRES_DB}"
    )


# Shared connection pool
pg_pool = ConnectionPool(
    conninfo=_build_postgres_url(),
    max_size=10,
    kwargs={"autocommit": True, "row_factory": dict_row},
)


def init_postgres_tables():
    """Create users and threads tables if they don't exist."""
    with pg_pool.connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_users (
                email       TEXT PRIMARY KEY,
                user_id     TEXT UNIQUE NOT NULL,
                password    TEXT NOT NULL,
                full_name   TEXT NOT NULL DEFAULT '',
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_threads (
                thread_id   TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL,
                title       TEXT NOT NULL DEFAULT 'New Chat',
                created_at  TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_threads_user_id
            ON app_threads (user_id);
        """)


# ── CRUD helpers ─────────────────────────────────────────────

# Users

def get_user_by_email(email: str) -> dict | None:
    with pg_pool.connection() as conn:
        row = conn.execute(
            "SELECT email, user_id, password, full_name FROM app_users WHERE email = %s",
            (email,),
        ).fetchone()
        return dict(row) if row else None


def create_user(email: str, user_id: str, password: str, full_name: str) -> dict:
    with pg_pool.connection() as conn:
        conn.execute(
            "INSERT INTO app_users (email, user_id, password, full_name) VALUES (%s, %s, %s, %s)",
            (email, user_id, password, full_name),
        )
    return {"email": email, "user_id": user_id, "password": password, "full_name": full_name}


# Threads

def get_threads_for_user(user_id: str) -> list[dict]:
    with pg_pool.connection() as conn:
        rows = conn.execute(
            "SELECT thread_id, user_id, title, created_at FROM app_threads WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,),
        ).fetchall()
        return [
            {**dict(r), "created_at": r["created_at"].isoformat() if r.get("created_at") else None}
            for r in rows
        ]


def create_thread_in_db(thread_id: str, user_id: str, title: str, created_at: str) -> dict:
    with pg_pool.connection() as conn:
        conn.execute(
            "INSERT INTO app_threads (thread_id, user_id, title, created_at) VALUES (%s, %s, %s, %s)",
            (thread_id, user_id, title, created_at),
        )
    return {"thread_id": thread_id, "user_id": user_id, "title": title, "created_at": created_at}


def update_thread_title_in_db(thread_id: str, user_id: str, title: str) -> dict | None:
    with pg_pool.connection() as conn:
        row = conn.execute(
            "UPDATE app_threads SET title = %s WHERE thread_id = %s AND user_id = %s RETURNING thread_id, user_id, title, created_at",
            (title, thread_id, user_id),
        ).fetchone()
        if row:
            return {**dict(row), "created_at": row["created_at"].isoformat() if row.get("created_at") else None}
        return None


def delete_thread_in_db(thread_id: str, user_id: str) -> bool:
    with pg_pool.connection() as conn:
        result = conn.execute(
            "DELETE FROM app_threads WHERE thread_id = %s AND user_id = %s",
            (thread_id, user_id),
        )
        return result.rowcount > 0


def get_thread_by_id(thread_id: str, user_id: str) -> dict | None:
    with pg_pool.connection() as conn:
        row = conn.execute(
            "SELECT thread_id, user_id, title, created_at FROM app_threads WHERE thread_id = %s AND user_id = %s",
            (thread_id, user_id),
        ).fetchone()
        if row:
            return {**dict(row), "created_at": row["created_at"].isoformat() if row.get("created_at") else None}
        return None
