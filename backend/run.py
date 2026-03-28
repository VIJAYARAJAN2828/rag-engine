"""
Entry point for Render deployment.
Render will run: uvicorn run:app --host 0.0.0.0 --port $PORT
"""
from main import app  # re-export so Render finds it easily

__all__ = ["app"]
