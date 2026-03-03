from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://localhost:5432/gastown_fin"
    openrouter_api_key: str = ""
    massive_api_key: str = ""
    massive_poll_interval: float = 15.0  # seconds; 15 for free tier, 2-15 for paid
    llm_mock: bool = False

    model_config = {"env_prefix": ""}


settings = Settings()
