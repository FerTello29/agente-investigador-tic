"""Paso 17: primera llamada sin herramientas para validar API Key y SDK.

Uso (desde la raíz): python -m scripts.prueba_minima
"""
from openai import OpenAI
from app.core.config import settings

client = OpenAI(api_key=settings.openai_api_key)
response = client.responses.create(
    model=settings.openai_model,
    input="En una frase, ¿qué es un agente de inteligencia artificial?",
)
print(response.output_text)
