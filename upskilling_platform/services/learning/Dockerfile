FROM python:3.12-slim

WORKDIR /app

# Copy and install service dependencies
COPY services/learning /app/services/learning
RUN pip install --no-cache-dir fastapi uvicorn sqlalchemy pg8000 pika minio python-multipart

# Copy and install shared common package
COPY packages/common /app/packages/common
RUN pip install --no-cache-dir -e /app/packages/common

# Copy services __init__.py for package resolution
COPY services/__init__.py /app/services/__init__.py

ENV PYTHONPATH=/app

EXPOSE 8002

CMD ["uvicorn", "services.learning.main:app", "--host", "0.0.0.0", "--port", "8002"]
