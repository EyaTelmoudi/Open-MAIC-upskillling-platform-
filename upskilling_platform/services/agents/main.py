import os

from fastapi import FastAPI

app = FastAPI(title="AI Agents Service")

SERVICE_PORT = os.getenv("AGENTS_SERVICE_PORT", "8003")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "agents", "port": SERVICE_PORT}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(SERVICE_PORT))
