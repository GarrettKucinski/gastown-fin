"""Database connection pool and schema initialization using asyncpg."""

from pathlib import Path

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schema"

DEFAULT_USER_EMAIL = "default@finally.app"

DEFAULT_WATCHLIST = [
    "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA",
    "NVDA", "META", "JPM", "V", "NFLX",
]

DEFAULT_CASH_BALANCE = 10_000.0

# Default portfolio positions: (symbol, quantity, avg_cost)
# Spreads across all 10 tickers with varying sizes for a realistic treemap
DEFAULT_POSITIONS: list[tuple[str, float, float]] = [
    ("AAPL", 25, 165.00),
    ("GOOGL", 15, 135.50),
    ("MSFT", 12, 350.00),
    ("AMZN", 20, 170.00),
    ("TSLA", 10, 220.00),
    ("NVDA", 8, 450.00),
    ("META", 14, 370.00),
    ("JPM", 18, 175.00),
    ("V", 10, 260.00),
    ("NFLX", 6, 470.00),
]


def _asyncpg_dsn() -> str:
    """Convert SQLAlchemy-style DSN to plain postgresql:// for asyncpg."""
    return settings.database_url.replace("postgresql+asyncpg://", "postgresql://")


async def get_pool() -> asyncpg.Pool:
    """Return the shared connection pool (must be initialized first)."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized — call init_db() first")
    return _pool


async def init_db() -> None:
    """Create the connection pool, run schema migrations, and seed defaults."""
    global _pool
    _pool = await asyncpg.create_pool(_asyncpg_dsn(), min_size=2, max_size=10)

    async with _pool.acquire() as conn:
        await _run_schema(conn)
        await _seed_defaults(conn)


async def close_db() -> None:
    """Gracefully close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def _run_schema(conn: asyncpg.Connection) -> None:
    """Execute all numbered SQL files in schema/ in sorted order."""
    sql_files = sorted(SCHEMA_DIR.glob("*.sql"))
    for sql_file in sql_files:
        await conn.execute(sql_file.read_text())


async def _seed_defaults(conn: asyncpg.Connection) -> None:
    """Insert default user, profile, and watchlist if they don't exist."""
    # Create default user (idempotent via ON CONFLICT)
    user_id = await conn.fetchval(
        """
        INSERT INTO users (email)
        VALUES ($1)
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
        RETURNING id
        """,
        DEFAULT_USER_EMAIL,
    )

    # Create default profile with cash balance
    await conn.execute(
        """
        INSERT INTO users_profile (user_id, display_name, cash_balance)
        VALUES ($1, 'Default User', $2)
        ON CONFLICT (user_id) DO NOTHING
        """,
        user_id,
        DEFAULT_CASH_BALANCE,
    )

    # Seed watchlist tickers
    for symbol in DEFAULT_WATCHLIST:
        await conn.execute(
            """
            INSERT INTO watchlist (user_id, symbol)
            VALUES ($1, $2)
            ON CONFLICT (user_id, symbol) DO NOTHING
            """,
            user_id,
            symbol,
        )

    # Seed default positions (simulated portfolio)
    for symbol, qty, cost in DEFAULT_POSITIONS:
        await conn.execute(
            """
            INSERT INTO positions (user_id, symbol, quantity, avg_cost)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, symbol) DO NOTHING
            """,
            user_id,
            symbol,
            qty,
            cost,
        )
