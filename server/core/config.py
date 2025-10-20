import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    pool_min_size: int
    pool_max_size: int
    default_title: str = "New Chat"

    @classmethod
    def load(cls) -> "Settings":
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL must be configured in the environment for persistence.")

        pool_min_size = int(os.getenv("DB_POOL_MIN_SIZE", "1"))
        pool_max_size = int(os.getenv("DB_POOL_MAX_SIZE", "5"))

        return cls(
            database_url=database_url,
            pool_min_size=pool_min_size,
            pool_max_size=pool_max_size,
        )
