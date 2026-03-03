CREATE TABLE IF NOT EXISTS users_profile (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name    TEXT NOT NULL DEFAULT '',
    cash_balance    NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);
