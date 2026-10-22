"""Configuración centralizada: las credenciales solo se leen en el servidor.

En local los valores provienen de .env; en Vercel, de las variables de entorno
del proyecto. Ningún otro módulo necesita saber dónde se almacenan.
"""
import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


def _lista(valor: str) -> list[str]:
    return [item.strip() for item in valor.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_model: str = field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-6-luna"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "5000")))
    allowed_origins: list[str] = field(
        default_factory=lambda: _lista(os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5000,http://localhost:5000"))
    )

    @property
    def configurado(self) -> bool:
        return bool(self.openai_api_key)


settings = Settings()
