FROM python:3.12-slim

WORKDIR /app

# Copy and install shared common package
COPY packages/common /app/packages/common
RUN pip install --no-cache-dir /app/packages/common

# Copy and install service dependencies
COPY services/identity /app/services/identity
RUN pip install --no-cache-dir fastapi uvicorn sqlalchemy python-jose[cryptography] bcrypt pg8000 pika minio python-multipart httpx email-validator openpyxl

# Copy services __init__.py for package resolution
COPY services/__init__.py /app/services/__init__.py

ENV PYTHONPATH=/app

EXPOSE 8001

CMD ["uvicorn", "services.identity.main:app", "--host", "0.0.0.0", "--port", "8001"]
