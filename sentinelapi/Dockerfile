FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY engine /app/engine
COPY sentinelshop /app/sentinelshop
COPY cli /app/cli
# To serve the built UI from this container too, build the frontend
# (cd web && npm ci && npm run build) then add:  COPY web/dist /app/web/dist
EXPOSE 8000
CMD ["uvicorn", "engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
