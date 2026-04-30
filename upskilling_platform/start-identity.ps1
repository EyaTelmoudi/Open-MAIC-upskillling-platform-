$env:SETUP_SECRET_KEY = "change-this-setup-secret-key-in-production"
cd D:\PFE\upskilling_platform
python -m uvicorn services.identity.main:app --host 0.0.0.0 --port 8001