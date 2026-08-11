import json
import asyncio
import uuid
from datetime import datetime
from typing_extensions import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage

from app.api.schemas import (
    UserRegisterRequest, UserLoginRequest, TokenResponse,
    CreateThreadRequest, ThreadSchema, ChatRequest, ChatResponse,
    UpdateThreadRequest, DeleteThreadResponse, GenerateTitleRequest
)
from app.api.auth import USERS_DB, THREADS_DB, create_access_token, get_current_user
from app.agent.graph import graph

router = APIRouter(prefix="/api/v1", tags=["BoxOfficePulse Suite"])


@router.post("/auth/register", response_model=TokenResponse)
async def register(req: UserRegisterRequest):
    if req.email in USERS_DB:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    USERS_DB[req.email] = {
        "user_id": user_id,
        "email": req.email,
        "password": req.password, # Plaintext for demo simplicity
        "full_name": req.full_name
    }
    THREADS_DB[user_id] = [] # Initialize empty threads for user

    token = create_access_token({"sub": user_id, "email": req.email})
    return TokenResponse(access_token=token, user_id=user_id, email=req.email)


from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends

@router.post("/auth/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Swagger sends the email inside 'form_data.username'
    user = USERS_DB.get(form_data.username)
    
    if not user or user["password"] != form_data.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user["user_id"], "email": user["email"]})
    return TokenResponse(access_token=token, user_id=user["user_id"], email=user["email"])


@router.get("/threads", response_model=List[ThreadSchema])
async def list_user_threads(current_user: dict = Depends(get_current_user)):
    """Gets all chat threads belonging to the logged-in user."""
    user_id = current_user["user_id"]
    return THREADS_DB.get(user_id, [])


@router.post("/threads", response_model=ThreadSchema)
async def create_new_thread(req: CreateThreadRequest, current_user: dict = Depends(get_current_user)):
    """Creates a new isolated chat thread for the user."""
    user_id = current_user["user_id"]
    thread_id = f"th_{uuid.uuid4().hex[:8]}"
    
    new_thread = {
        "thread_id": thread_id,
        "user_id": user_id,
        "title": req.title or "New Chat",
        "created_at": datetime.utcnow().isoformat()
    }
    
    if user_id not in THREADS_DB:
        THREADS_DB[user_id] = []
        
    THREADS_DB[user_id].insert(0, new_thread)
    return new_thread


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    """Run chat for a specific thread owned by current user."""
    user_id = current_user["user_id"]
    
    # Scoped config ensuring isolated memory per user & thread
    config = {"configurable": {"thread_id": req.thread_id, "user_id": user_id}}
    input_state = {
        "messages": [HumanMessage(content=req.message)],
        "thread_id": req.thread_id
    }

    try:
        result = await asyncio.to_thread(graph.invoke, input_state, config)
        last_message = result["messages"][-1].content if result.get("messages") else "No response."

        return ChatResponse(
            response=last_message,
            thread_id=req.thread_id,
            user_id=user_id,
            intent=result.get("current_intent"),
            generated_sql=result.get("generated_sql"),
            query_results=result.get("query_results"),
            recommended_actions=result.get("recommended_actions"),
            reasoning_steps=result.get("reasoning_steps", [])
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest, current_user: dict = Depends(get_current_user)):
    """SSE Stream for thread-isolated execution."""
    user_id = current_user["user_id"]

    async def event_generator():
        config = {"configurable": {"thread_id": req.thread_id, "user_id": user_id}}
        input_state = {
            "messages": [HumanMessage(content=req.message)],
            "thread_id": req.thread_id
        }

        for event in graph.stream(input_state, config, stream_mode="updates"):
            for node_name, node_state in event.items():
                payload = {
                    "node": node_name,
                    "user_id": user_id,
                    "thread_id": req.thread_id,
                    "reasoning_steps": node_state.get("reasoning_steps", []),
                    "intent": node_state.get("current_intent"),
                    "generated_sql": node_state.get("generated_sql"),
                    "query_results": node_state.get("query_results"),
                    "recommended_actions": node_state.get("recommended_actions")
                }
                if "messages" in node_state and len(node_state["messages"]) > 0:
                    payload["message"] = node_state["messages"][-1].content

                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0.05)

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.patch("/threads/{thread_id}", response_model=ThreadSchema)
async def update_thread_title(
    thread_id: str, 
    req: UpdateThreadRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Updates the title of a specific chat thread."""
    user_id = current_user["user_id"]
    threads = THREADS_DB.get(user_id, [])
    
    for thread in threads:
        if thread["thread_id"] == thread_id:
            thread["title"] = req.title
            return thread
            
    raise HTTPException(status_code=404, detail="Thread not found")


@router.delete("/threads/{thread_id}", response_model=DeleteThreadResponse)
async def delete_thread(
    thread_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """Deletes a chat thread for the current user."""
    user_id = current_user["user_id"]
    if user_id in THREADS_DB:
        THREADS_DB[user_id] = [t for t in THREADS_DB[user_id] if t["thread_id"] != thread_id]
        return DeleteThreadResponse(status="deleted", thread_id=thread_id)
        
    raise HTTPException(status_code=404, detail="Thread not found")


@router.post("/threads/{thread_id}/generate-title", response_model=ThreadSchema)
async def generate_thread_title(
    thread_id: str,
    req: GenerateTitleRequest,
    current_user: dict = Depends(get_current_user)
):
    """Generates a title using Gemini LLM for the thread based on the first query."""
    user_id = current_user["user_id"]
    threads = THREADS_DB.get(user_id, [])
    
    # Find the thread
    target_thread = None
    for thread in threads:
        if thread["thread_id"] == thread_id:
            target_thread = thread
            break
            
    if not target_thread:
        raise HTTPException(status_code=404, detail="Thread not found")
        
    # Get LLM and generate a title
    from app.agent.llm_service import get_llm
    llm = get_llm(temperature=0.3)
    prompt = (
        f"Generate a short, concise, high-density dashboard title (2-10 words maximum) "
        f"for a chat session starting with this user query: '{req.first_query}'. "
        f"Do not put any quotes, prefix, or extra text in the response, just return the title itself. "
        f"Format in proper Title Case (capitalizing key words)."
    )
    
    try:
        response = await asyncio.to_thread(llm.invoke, prompt)
        generated_title = response.content.strip().replace('"', '').replace("'", "")
        # Fallback if empty
        if not generated_title:
            generated_title = "New Session"
    except Exception as e:
        generated_title = "New Session"
        
    target_thread["title"] = generated_title
    return target_thread