from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://localhost:5432/gastown_fin"
    openrouter_api_key: str = ""
    massive_api_key: str = ""
    llm_mock: bool = False

    model_config = {"env_prefix": ""}


settings = Settings()
