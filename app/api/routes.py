import re 
import io
import json
import asyncio
import uuid
import pandas as pd
from datetime import datetime
from typing_extensions import List
from app.db.clickhouse import ch_client
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage

from app.api.schemas import (
    UserRegisterRequest, UserLoginRequest, TokenResponse,
    CreateThreadRequest, ThreadSchema, ChatRequest, ChatResponse,
    UpdateThreadRequest, DeleteThreadResponse, GenerateTitleRequest
)
from app.api.auth import create_access_token, get_current_user
from app.db.postgres import (
    get_user_by_email, create_user,
    get_threads_for_user, create_thread_in_db,
    update_thread_title_in_db, delete_thread_in_db, get_thread_by_id
)
from app.agent.graph import graph

router = APIRouter(prefix="/api/v1", tags=["BoxOfficePulse Suite"])


@router.post("/auth/register", response_model=TokenResponse)
async def register(req: UserRegisterRequest):
    existing = get_user_by_email(req.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"usr_{uuid.uuid4().hex[:8]}"
    create_user(req.email, user_id, req.password, req.full_name)

    token = create_access_token({"sub": user_id, "email": req.email})
    return TokenResponse(access_token=token, user_id=user_id, email=req.email)


from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends

@router.post("/auth/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Swagger sends the email inside 'form_data.username'
    user = get_user_by_email(form_data.username)
    
    if not user or user["password"] != form_data.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": user["user_id"], "email": user["email"]})
    return TokenResponse(access_token=token, user_id=user["user_id"], email=user["email"])


@router.post("/auth/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """
    Endpoint to logout the current user.
    """
    return {"status": "success", "message": "Successfully logged out"}



@router.get("/threads", response_model=List[ThreadSchema])
async def list_user_threads(current_user: dict = Depends(get_current_user)):
    """Gets all chat threads belonging to the logged-in user."""
    user_id = current_user["user_id"]
    return get_threads_for_user(user_id)


@router.post("/threads", response_model=ThreadSchema)
async def create_new_thread(req: CreateThreadRequest, current_user: dict = Depends(get_current_user)):
    """Creates a new isolated chat thread for the user."""
    user_id = current_user["user_id"]
    thread_id = f"th_{uuid.uuid4().hex[:8]}"
    created_at = datetime.utcnow().isoformat()
    title = req.title or "New Chat"
    
    new_thread = create_thread_in_db(thread_id, user_id, title, created_at)
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
    updated = update_thread_title_in_db(thread_id, user_id, req.title)
    if updated:
        return updated
    raise HTTPException(status_code=404, detail="Thread not found")


@router.delete("/threads/{thread_id}", response_model=DeleteThreadResponse)
async def delete_thread(
    thread_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """Deletes a chat thread for the current user."""
    user_id = current_user["user_id"]
    deleted = delete_thread_in_db(thread_id, user_id)
    if deleted:
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
    target_thread = get_thread_by_id(thread_id, user_id)
            
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
        if not generated_title:
            generated_title = "New Session"
    except Exception as e:
        generated_title = "New Session"
        
    updated = update_thread_title_in_db(thread_id, user_id, generated_title)
    return updated or target_thread


# async def event_generator():
#     try:
#         for event in graph.stream(input_state, config, stream_mode="updates"):
#             yield f"data: {json.dumps(event)}\n\n"
#     except Exception as e:
#         yield f"data: {json.dumps({'error': 'Rate limit reached or server error. Please wait 30 seconds and retry.'})}\n\n"


def clean_column_name(col: str) -> str:
    """Sanitize column names to prevent SQL injection and ClickHouse syntax errors."""
    cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', str(col).strip().lower())
    if cleaned and cleaned[0].isdigit():
        cleaned = f"col_{cleaned}"
    return cleaned or "unnamed_column"

def map_dtype_to_clickhouse(dtype) -> str:
    """Maps Pandas data types to ClickHouse data types."""
    if pd.api.types.is_integer_dtype(dtype):
        return "Int64"
    elif pd.api.types.is_float_dtype(dtype):
        return "Float64"
    elif pd.api.types.is_bool_dtype(dtype):
        return "Bool"
    elif pd.api.types.is_datetime64_any_dtype(dtype):
        return "DateTime64(3)"
    else:
        return "String"

@router.post("/dataset/upload")
async def upload_custom_dataset(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Safely ingests custom user CSV files into ClickHouse by dynamically 
    normalizing schemas and creating/updating the target table.
    """
    if not file.filename.endswith(('.csv', '.txt')):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="Uploaded CSV file is empty.")

        # Clean column headers
        df.columns = [clean_column_name(col) for col in df.columns]
        
        # Ensure object columns are cast to string to prevent mixed-type errors
        for col in df.select_dtypes(include=['object']).columns:
            df[col] = df[col].fillna("").astype(str)

        user_id = current_user["user_id"]
        
        # Add mandatory tenant and upload time metadata
        df['user_id'] = user_id
        if 'uploaded_at' not in df.columns:
            df['uploaded_at'] = pd.Timestamp.now()

        table_name = "user_datasets"

        # Initialize the shared multi-tenant table if it doesn't exist
        ch_client.command(f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                user_id String,
                uploaded_at DateTime64(3)
            ) ENGINE = MergeTree()
            ORDER BY (user_id, uploaded_at)
        """)

        # Dynamically evolve table schema with any new columns
        for col_name, dtype in df.dtypes.items():
            if col_name in ('user_id', 'uploaded_at'):
                continue
            ch_type = map_dtype_to_clickhouse(dtype)
            ch_client.command(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS `{col_name}` {ch_type}")

        # Delete existing records belonging to that specific user
        ch_client.command(f"ALTER TABLE {table_name} DELETE WHERE user_id = '{user_id}'")

        # Insert updated DataFrame containing user_id
        ch_client.insert_df(
            table=table_name,
            df=df
        )

        return {
            "status": "success",
            "message": "Dataset safely stored with row-level tenant isolation.",
            "user_id": user_id,
            "rows_inserted": len(df),
            "table_name": table_name
        }

    except HTTPException:
        # Re-raise HTTP exceptions so 400 errors aren't caught as 500s
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to process custom dataset: {str(e)}"
        )


@router.post("/simulator/trigger")
async def trigger_simulator(num_records: int = 10):
    """
    Triggers simulated live ticket sales injection into ClickHouse.
    """
    try:
        from app.services.simulator import simulator
        ticket_data = simulator.generate_ticket_sales_batch(count=num_records)
        ch_client.insert(
            "ticket_sales",
            ticket_data,
            column_names=["ticket_id", "movie_id", "movie_title", "theater_id", "screen_number", "ticket_price", "discount_applied", "timestamp"]
        )
        return {
            "status": "success",
            "message": f"Injected {num_records} new live ticket sales into ClickHouse Cloud!",
            "records_inserted": num_records
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to inject live ticket sales: {str(e)}"
        )


@router.get("/dataset/status")
async def get_dataset_status(current_user: dict = Depends(get_current_user)):
    """
    Checks if the custom user sales dataset exists and is loaded.
    """
    try:
        user_id = current_user["user_id"]
        table_name = "user_datasets"
        exists = ch_client.command(f"EXISTS TABLE {table_name}")
        if exists:
            res = ch_client.query(f"SELECT count() FROM {table_name} WHERE user_id = '{user_id}'")
            row_count = res.result_rows[0][0] if res.result_rows else 0
            
            if row_count > 0:
                # Get schema
                schema_res = ch_client.query(f"DESCRIBE TABLE {table_name}")
                columns = [row[0] for row in schema_res.result_rows]
                
                return {
                    "active": True,
                    "table_name": table_name,
                    "row_count": row_count,
                    "columns": columns
                }
        return {
            "active": False,
            "table_name": table_name,
            "row_count": 0,
            "columns": []
        }
    except Exception as e:
        return {
            "active": False,
            "table_name": "user_datasets",
            "row_count": 0,
            "columns": [],
            "error": str(e)
        }


@router.get("/threads/{thread_id}/messages")
async def list_thread_messages(thread_id: str, current_user: dict = Depends(get_current_user)):
    """
    Retrieves the parsed message history for a specific thread.
    Associated metadata (intent, SQL, results, recommendations) is reconstructed
    using state history from the checkpointer.
    """
    user_id = current_user["user_id"]
    config = {"configurable": {"thread_id": thread_id, "user_id": user_id}}

    try:
        # 1. Fetch metadata history from checkpointer snapshots
        def get_metadata_map():
            m_map = {}
            for state_snapshot in graph.get_state_history(config):
                msgs = state_snapshot.values.get("messages", [])
                if msgs and (isinstance(msgs[-1], AIMessage) or getattr(msgs[-1], "type", None) == "ai"):
                    last_msg = msgs[-1]
                    msg_id = getattr(last_msg, "id", None)
                    content = getattr(last_msg, "content", "")
                    key = msg_id if msg_id else content
                    if key not in m_map:
                        m_map[key] = {
                            "intent": state_snapshot.values.get("current_intent"),
                            "generated_sql": state_snapshot.values.get("generated_sql"),
                            "query_results": state_snapshot.values.get("query_results"),
                            "recommended_actions": state_snapshot.values.get("recommended_actions"),
                            "reasoning_steps": state_snapshot.values.get("reasoning_steps", [])
                        }
            return m_map

        metadata_map = await asyncio.to_thread(get_metadata_map)

        # 2. Retrieve final state values
        state = await asyncio.to_thread(graph.get_state, config)
        if not state or not state.values:
            return []

        messages = state.values.get("messages", [])
        formatted_messages = []

        for i, msg in enumerate(messages):
            if isinstance(msg, HumanMessage) or getattr(msg, "type", None) == "human":
                role = "user"
            elif isinstance(msg, AIMessage) or getattr(msg, "type", None) == "ai":
                role = "assistant"
            else:
                continue

            msg_id = getattr(msg, "id", None) or f"msg_{i}"
            content = getattr(msg, "content", "")
            
            # Retrieve timestamp from message or generate one
            timestamp = datetime.utcnow().isoformat()
            if hasattr(msg, "response_metadata") and isinstance(msg.response_metadata, dict):
                timestamp = msg.response_metadata.get("timestamp", timestamp)

            formatted_msg = {
                "id": msg_id,
                "role": role,
                "content": content,
                "timestamp": timestamp,
                "reasoning_steps": []
            }

            if role == "assistant":
                key = msg_id
                if key not in metadata_map:
                    key = content
                meta = metadata_map.get(key, {})
                formatted_msg.update({
                    "intent": meta.get("intent"),
                    "generated_sql": meta.get("generated_sql"),
                    "query_results": meta.get("query_results"),
                    "recommended_actions": meta.get("recommended_actions"),
                    "reasoning_steps": meta.get("reasoning_steps", [])
                })

            formatted_messages.append(formatted_msg)

        return formatted_messages

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch conversation history: {str(e)}"
        )
