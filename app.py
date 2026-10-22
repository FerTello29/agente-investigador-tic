"""Punto de entrada local: python app.py → http://127.0.0.1:5000"""
import uvicorn
from app.core.config import settings
from app.main import app

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=settings.port, reload=False)
