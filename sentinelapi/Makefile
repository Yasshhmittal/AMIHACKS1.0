.PHONY: install shop engine dev test scan reset up down clean

install:
	python -m venv venv && . venv/bin/activate && pip install -r requirements.txt

shop:
	uvicorn sentinelshop.app:app --host 0.0.0.0 --port 4000 --reload

engine:
	uvicorn engine.main:app --host 0.0.0.0 --port 8000 --reload

test:
	pytest engine/tests -q

scan:
	python cli/sentinel.py scan --spec sentinelshop/openapi.yaml --target http://localhost:4000 --fail-on high --out result.json

reset:
	curl -s -X POST http://localhost:4000/__reset

up:
	docker compose up --build

down:
	docker compose down

clean:
	rm -f sentinel.db sentinel.db-wal sentinel.db-shm result.json
