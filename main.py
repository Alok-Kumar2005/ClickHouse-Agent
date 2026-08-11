from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as api_router

app = FastAPI(
    title="BoxOfficePulse AI Agent API",
    version="1.0.0",
    description="Real-Time Box Office Analytics & Operational Action Engine"
)

# Enable CORS for frontend dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount router
app.include_router(api_router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "BoxOfficePulse Engine"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)