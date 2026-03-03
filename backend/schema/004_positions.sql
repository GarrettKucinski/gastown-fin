CREATE TABLE IF NOT EXISTS positions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol      TEXT NOT NULL,
    quantity    NUMERIC(15, 6) NOT NULL DEFAULT 0,
    avg_cost    NUMERIC(15, 4) NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, symbol)
);
