FROM python:3.11-slim

WORKDIR /app

# Install curl, build tools, nodejs/npm if prisma needs node for binary engines
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY prisma /app/prisma
RUN prisma generate

COPY engine /app/engine

EXPOSE 8000

CMD ["uvicorn", "engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
