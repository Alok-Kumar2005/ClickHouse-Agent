from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings

def get_llm(temperature: float = 0.0, model_name: str = "gemini-3.5-flash-lite") -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=settings.GEMINI_API_KEY,
        temperature=temperature,
        max_retries=5
    )