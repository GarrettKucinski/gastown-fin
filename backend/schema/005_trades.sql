CREATE TABLE IF NOT EXISTS trades (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol      TEXT NOT NULL,
    side        TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity    NUMERIC(15, 6) NOT NULL,
    price       NUMERIC(15, 4) NOT NULL,
    total       NUMERIC(15, 4) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
