CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_value     NUMERIC(15, 4) NOT NULL,
    cash_balance    NUMERIC(15, 2) NOT NULL,
    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_time
    ON portfolio_snapshots (user_id, snapshot_at DESC);
