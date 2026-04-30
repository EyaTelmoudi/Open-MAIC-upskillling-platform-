@echo off
cd D:\PFE\upskilling_platform
set SETUP_SECRET_KEY=change-this-setup-secret-key-in-production
set DATABASE_URL=postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform
set RABBITMQ_HOST=localhost
uvicorn services.identity.main:app --host 0.0.0.0 --port 8001 --log-level error
pause