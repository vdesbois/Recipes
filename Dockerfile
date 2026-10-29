FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --chown=10001:10001 backend ./backend
COPY --chown=10001:10001 database ./database
COPY --chown=10001:10001 frontend ./frontend

RUN mkdir -p /app/data && chown 10001:10001 /app/data

USER 10001:10001

EXPOSE 8000

CMD ["python3", "-m", "backend.server", "--host", "0.0.0.0", "--port", "8000", "--database", "/app/data/recipes.sqlite3"]
