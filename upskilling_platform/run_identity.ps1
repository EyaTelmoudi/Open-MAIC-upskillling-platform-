$env:SETUP_SECRET_KEY = "change-this-setup-secret-key-in-production"
$env:DATABASE_URL = "postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform"
$env:RABBITMQ_HOST = "localhost"
$env:LOG_LEVEL = "DEBUG"
cd D:\PFE\upskilling_platform
Write-Host "Starting identity service on port 8001..."
uvicorn services.identity.main:app --host 0.0.0.0 --port 8001 --reload