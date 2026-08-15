from typing import List, Dict, Any, Optional
from pydantic import BaseModel, EmailStr, Field


# Auth Schemas
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str


# Session & Thread Schemas
class CreateThreadRequest(BaseModel):
    title: Optional[str] = "New Chat"


class ThreadSchema(BaseModel):
    thread_id: str
    user_id: str
    title: str
    created_at: str


# Chat Request/Response Schemas
class ChatRequest(BaseModel):
    message: str = Field(..., example="What is the box office revenue for Dune?")
    thread_id: str = Field(..., description="Active thread ID belonging to the user")


class ChatResponse(BaseModel):
    response: str
    thread_id: str
    user_id: str
    intent: Optional[str] = None
    generated_sql: Optional[str] = None
    query_results: Optional[List[Dict[str, Any]]] = None
    recommended_actions: Optional[List[Dict[str, Any]]] = None
    reasoning_steps: List[str] = []

class UpdateThreadRequest(BaseModel):
    title: str

class DeleteThreadResponse(BaseModel):
    status: str
    thread_id: str

class GenerateTitleRequest(BaseModel):
    first_query: str


# Stream Configuration Schema
class StreamStartRequest(BaseModel):
    movies: Optional[List[str]] = Field(default=None, description="List of movie titles to stream. If empty, falls back to TMDB top movies.")
    min_price: Optional[float] = Field(default=None, ge=0, description="Minimum ticket price in dollars.")
    max_price: Optional[float] = Field(default=None, ge=0, description="Maximum ticket price in dollars.")
    events_per_second: Optional[int] = Field(default=None, ge=1, le=50, description="Events to generate per second (1-50).")
    theaters: Optional[List[str]] = Field(default=None, description="List of Theater IDs to stream. If empty, uses all available theaters.")