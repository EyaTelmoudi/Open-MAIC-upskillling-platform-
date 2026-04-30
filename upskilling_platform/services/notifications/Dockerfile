FROM python:3.12-slim

WORKDIR /app

# Copy and install service dependencies
COPY services/notifications /app/services/notifications
RUN pip install --no-cache-dir fastapi uvicorn[standard] pika python-jose[cryptography]

# Copy and install shared common package
COPY packages/common /app/packages/common
RUN pip install --no-cache-dir -e /app/packages/common

# Copy services package marker for package resolution
COPY services/__init__.py /app/services/__init__.py

ENV PYTHONPATH=/app

EXPOSE 8004

CMD ["uvicorn", "services.notifications.main:app", "--host", "0.0.0.0", "--port", "8004"]
