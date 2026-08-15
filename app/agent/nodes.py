import json
from typing import Literal, List, Optional, Any
from pydantic import BaseModel, Field
from langchain_core.messages import (
    BaseMessage,
    SystemMessage,
    HumanMessage,
    AIMessage,
    trim_messages
)
from langchain_core.runnables import RunnableConfig

from app.agent.state import AgentState
from app.agent.llm_service import get_llm
from app.agent.prompts import SUPERVISOR_PROMPT, ANALYTICS_PROMPT, ACTION_PROMPT, STREAM_CONTROL_PROMPT
from app.agent.tools import execute_clickhouse_query
from app.services.live_streamer import live_streamer


def extract_text_content(content) -> str:
    """Safely extracts plain string content from LLM response content (str or list)."""
    if isinstance(content, str):
        return content
    elif isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, str):
                text_parts.append(part)
            elif isinstance(part, dict) and "text" in part:
                text_parts.append(part["text"])
        return "".join(text_parts)
    return str(content)


class IntentClassification(BaseModel):
    intent: Literal["general_chat", "analytics_query", "anomaly_action", "stream_control"] = Field(
        description="Classification of executive intent."
    )
    reasoning: str = Field(
        description="Brief explanation for why this category was chosen."
    )

class ActionItem(BaseModel):
    action_type: str = Field(description="Type of action e.g., DYNAMIC_PRICING, SCREEN_SHIFT, MARKETING_BOOST")
    target: str = Field(description="Target movie, theater, or screen ID")
    description: str = Field(description="Detailed operational recommendation")
    estimated_impact: str = Field(description="Expected business ROI or percentage lift")
    status: str = Field(default="PENDING_APPROVAL")

class ActionPlan(BaseModel):
    actions: List[ActionItem]
    executive_summary: str = Field(description="High level summary of recommendations")


def character_token_counter(messages: List[BaseMessage]) -> int:
    total_chars = 0
    for msg in messages:
        if isinstance(msg, tuple) and len(msg) >= 2:
            total_chars += len(str(msg[1]))
        elif hasattr(msg, "content"):
            if isinstance(msg.content, list):
                total_chars += len(json.dumps(msg.content))
            else:
                total_chars += len(str(msg.content))
        else:
            total_chars += len(str(msg))
    return (total_chars + 3) // 4


def safe_trim_messages(messages: List[Any], max_tokens: int = 5000) -> List[Any]:
    trimmed = trim_messages(
        messages,
        max_tokens=max_tokens,
        strategy="last",
        token_counter=character_token_counter,
        include_system=True,
        allow_partial=False
    )
    
    # Check if input had non-system messages but trimmed result does not
    has_input_non_system = any(
        not (isinstance(m, tuple) and m[0] == "system" or getattr(m, "type", None) == "system" or m.__class__.__name__ == "SystemMessage")
        for m in messages
    )
    has_output_non_system = any(
        not (isinstance(m, tuple) and m[0] == "system" or getattr(m, "type", None) == "system" or m.__class__.__name__ == "SystemMessage")
        for m in trimmed
    )
    
    if has_input_non_system and not has_output_non_system:
        # Fallback: keep system messages and a truncated version of the last non-system message
        system_msgs = []
        last_non_system = None
        for m in messages:
            is_sys = (isinstance(m, tuple) and m[0] == "system") or getattr(m, "type", None) == "system" or m.__class__.__name__ == "SystemMessage"
            if is_sys:
                system_msgs.append(m)
            else:
                last_non_system = m
                
        sys_chars = sum(len(str(getattr(m, "content", m[1] if isinstance(m, tuple) else m))) for m in system_msgs)
        rem_chars = max(0, max_tokens * 4 - sys_chars)
        
        if last_non_system is not None:
            if isinstance(last_non_system, tuple):
                role, content = last_non_system[0], str(last_non_system[1])
                truncated_content = content[-rem_chars:] if rem_chars > 0 else ""
                last_non_system = (role, truncated_content)
            elif hasattr(last_non_system, "content"):
                content = str(last_non_system.content)
                truncated_content = content[-rem_chars:] if rem_chars > 0 else ""
                if isinstance(last_non_system, HumanMessage):
                    last_non_system = HumanMessage(content=truncated_content, additional_kwargs=getattr(last_non_system, "additional_kwargs", {}))
                elif isinstance(last_non_system, AIMessage):
                    last_non_system = AIMessage(content=truncated_content, additional_kwargs=getattr(last_non_system, "additional_kwargs", {}))
                else:
                    last_non_system = last_non_system.__class__(content=truncated_content)
            trimmed = system_msgs + [last_non_system]
            
    return trimmed


def get_custom_table_schema(user_id: Optional[str] = None) -> str:
    """Dynamically fetch user_datasets schema if the table exists and contains records for user."""
    try:
        from app.db.clickhouse import ch_client
        exists = ch_client.command("EXISTS TABLE user_datasets")
        if exists and user_id:
            # Check if this user actually has records uploaded
            count_res = ch_client.query(f"SELECT count() FROM user_datasets WHERE user_id = '{user_id}'")
            has_records = count_res.result_rows[0][0] > 0 if count_res.result_rows else False
            if has_records:
                res = ch_client.query("DESCRIBE TABLE user_datasets")
                columns_info = []
                for row in res.result_rows:
                    columns_info.append(f"{row[0]} ({row[1]})")
                return f"4. Table: user_datasets\n   Columns: {', '.join(columns_info)}"
    except Exception as e:
        print("Error fetching custom table schema:", e)
    return ""


class BoxOfficeAgentNodes:
    
    @staticmethod
    def supervisor_node(state: AgentState) -> dict:
        """Using structured output """
        llm = get_llm(temperature=0.0).with_structured_output(IntentClassification)
        
        messages = [
            SystemMessage(content=SUPERVISOR_PROMPT)
        ] + list(state["messages"])
        trimmed_messages = safe_trim_messages(messages)
        
        result: IntentClassification = llm.invoke(trimmed_messages)
        
        return {
            "current_intent": result.intent,
            "reasoning_steps": [f"🔍 Supervisor classified intent as '{result.intent}' ({result.reasoning})"]
        }

    @staticmethod
    def analytics_node(state: AgentState, config: Optional[RunnableConfig] = None) -> dict:
        """Generates ClickHouse SQL, executes query, and summarizes findings."""
        import re as _re
        llm = get_llm(temperature=0.1)
        user_query = state["messages"][-1].content
        
        user_id = config.get("configurable", {}).get("user_id") if config else None
        
        custom_schema = get_custom_table_schema(user_id)
        prompt = ANALYTICS_PROMPT
        if custom_schema:
            prompt += f"\n\nActive Custom Dataset:\n{custom_schema}\n"
            prompt += "\nCRITICAL BUSINESS RULE FOR CUSTOM DATASET:\n"
            prompt += "- If the user refers to their custom dataset, uploaded CSV, 'user_datasets', or 'custom data', you MUST query the `user_datasets` table.\n"
            prompt += f"- When querying user_datasets, you MUST ALWAYS append WHERE user_id = '{user_id}' to your query. You are strictly forbidden from executing SELECT statements without filtering by user_id.\n"
            prompt += "- Use the correct column names from the user_datasets schema provided above."
        
        if live_streamer.is_active:
            prompt += f"\n\nLIVE TICKET STREAM ACTIVE:\n"
            prompt += f"- A real-time live ticket stream is currently running and injecting synthetic ticket sales into the `ticket_sales` table in ClickHouse.\n"
            prompt += f"- Total events ingested so far by this live feed session: {live_streamer.total_events_ingested}.\n"
            prompt += f"- When the user asks about 'right now', 'live revenue', 'latest sales', 'total revenue right now', or real-time metrics, query the `ticket_sales` table to calculate current real-time metrics (e.g. SUM(ticket_price), count(), etc.)."
        
        # 1. Generate SQL with full conversation history
        messages = [
            SystemMessage(content=prompt)
        ] + list(state["messages"])
        trimmed_messages = safe_trim_messages(messages)
        
        raw_content = llm.invoke(trimmed_messages).content
        sql_text = extract_text_content(raw_content)
        sql_response = sql_text.strip().replace("```sql", "").replace("```", "").strip()
        
        # --- GUARDRAIL: Ensure the LLM output is valid SQL, not prose ---
        valid_sql_starters = ("select", "with", "show")
        if not sql_response.lower().startswith(valid_sql_starters):
            # Extract a keyword from the user query for a safe fuzzy fallback query
            keyword_match = _re.search(r'"([^"]+)"|\'([^\']+)\'|(\b\w[\w\s\-:]+)', user_query)
            fallback_keyword = (
                keyword_match.group(1) or keyword_match.group(2) or keyword_match.group(3)
                if keyword_match else user_query[:40]
            ).strip()
            sql_response = (
                f"SELECT DISTINCT movie_title, count() AS ticket_count, "
                f"round(sum(ticket_price), 2) AS total_revenue "
                f"FROM ticket_sales "
                f"WHERE movie_title ILIKE '%{fallback_keyword}%' "
                f"GROUP BY movie_title ORDER BY total_revenue DESC LIMIT 20"
            )
        
        # 2. Execute against ClickHouse
        query_result = execute_clickhouse_query.invoke({"query": sql_response, "user_id": user_id or ""})
        
        # --- FALLBACK LOOP: Zero rows → fuzzy title resolution → re-execute ---
        if query_result.get("row_count", 0) == 0:
            # Extract the movie keyword from the SQL filter (prefer explicit patterns)
            keyword = None
            ilike_match = _re.search(r"ILIKE\s+'%([^%]+)%'", sql_response, _re.IGNORECASE)
            eq_match = _re.search(r"movie_title\s*=\s*'([^']+)'", sql_response, _re.IGNORECASE)
            position_match = _re.search(
                r"positionCaseInsensitive\(movie_title,\s*'([^']+)'\)", sql_response, _re.IGNORECASE
            )
            if ilike_match:
                keyword = ilike_match.group(1)
            elif eq_match:
                keyword = eq_match.group(1)
            elif position_match:
                keyword = position_match.group(1)
            else:
                # Fall back to meaningful words in the user query
                words = _re.findall(r'\b[A-Za-z][\w\-:]+\b', user_query)
                stopwords = {
                    "what", "is", "are", "the", "for", "of", "show", "me", "give",
                    "get", "how", "many", "much", "total", "revenue", "sales",
                    "ticket", "tickets", "about", "from", "in", "a", "an"
                }
                keywords = [w for w in words if w.lower() not in stopwords and len(w) > 2]
                keyword = " ".join(keywords[:3]) if keywords else None
            
            if keyword:
                lookup_sql = (
                    f"SELECT DISTINCT movie_title FROM ticket_sales "
                    f"WHERE movie_title ILIKE '%{keyword}%' LIMIT 5"
                )
                lookup_result = execute_clickhouse_query.invoke({"query": lookup_sql, "user_id": user_id or ""})
                matched_titles = [row[0] for row in lookup_result.get("data", [])]
                
                if matched_titles:
                    resolved_title = matched_titles[0]
                    # Substitute keyword reference in the original SQL with the resolved title
                    resolved_sql = _re.sub(
                        r"(movie_title\s+ILIKE\s+'%)([^%]+)(%')",
                        lambda m: f"{m.group(1)}{resolved_title}{m.group(3)}",
                        sql_response,
                        flags=_re.IGNORECASE,
                    )
                    resolved_sql = _re.sub(
                        r"(movie_title\s*=\s*')[^']+'",
                        f"\\g<1>{resolved_title}'",
                        resolved_sql,
                        flags=_re.IGNORECASE,
                    )
                    resolved_result = execute_clickhouse_query.invoke(
                        {"query": resolved_sql, "user_id": user_id or ""}
                    )
                    if resolved_result.get("row_count", 0) > 0:
                        sql_response = resolved_sql
                        query_result = resolved_result
        
        # 3. Executive Data Summary
        analysis_prompt = (
            f"User Query: '{user_query}'\n"
            f"Generated SQL: {sql_response}\n"
            f"Data Output: {query_result}\n"
            f"Provide a concise executive summary."
        )
        trimmed_summary_messages = safe_trim_messages([
            HumanMessage(content=analysis_prompt)
        ])
        summary = extract_text_content(llm.invoke(trimmed_summary_messages).content)
        
        return {
            "generated_sql": sql_response,
            "query_results": query_result.get("data", []),
            "messages": [AIMessage(content=summary)],
            "reasoning_steps": [
                f"Generated SQL: {sql_response}",
                f"ClickHouse returned {query_result.get('row_count', 0)} rows."
            ]
        }

    @staticmethod
    def action_node(state: AgentState) -> dict:
        """Uses structured output to output clear operational action cards."""
        llm = get_llm(temperature=0.2).with_structured_output(ActionPlan)
        
        query_results = state.get("query_results", [])
        user_query = state["messages"][-1].content
        
        prompt = f"User Request: {user_query}\nCurrent Telemetry Data: {json.dumps(query_results)}\nFormulate business recommendations."
        trimmed_messages = safe_trim_messages([
            SystemMessage(content=ACTION_PROMPT),
            HumanMessage(content=prompt)
        ])
        
        plan: ActionPlan = llm.invoke(trimmed_messages)
        
        action_dicts = [a.model_dump() for a in plan.actions]
        
        formatted_message = f"**Executive Summary:** {plan.executive_summary}\n\n"
        for act in plan.actions:
            formatted_message += f"- **[{act.action_type}]** {act.target}: {act.description} *(Estimated Impact: {act.estimated_impact})*\n"
            
        return {
            "recommended_actions": action_dicts,
            "messages": [AIMessage(content=formatted_message)],
            "reasoning_steps": [f"💡 Generated {len(plan.actions)} structured action recommendations."]
        }

    @staticmethod
    def general_chat_node(state: AgentState) -> dict:
        """Handles general greetings and non-analytics interaction."""
        return {
            "messages": [AIMessage(content="Hello! I am BoxOfficePulse. Ask me for real-time ticket sales, audience sentiment, or theater occupancy analytics.")],
            "reasoning_steps": ["Handled via general chat node."]
        }

    @staticmethod
    def stream_control_node(state: AgentState) -> dict:
        """Handles natural language stream control commands — start, stop, and configure the live stream."""

        class StreamControlConfig(BaseModel):
            action: Literal["start", "stop"] = Field(description="Whether to start or stop the stream.")
            movies: List[str] = Field(default_factory=list, description="Movie titles to filter for.")
            min_price: Optional[float] = Field(default=None, description="Minimum ticket price.")
            max_price: Optional[float] = Field(default=None, description="Maximum ticket price.")
            events_per_second: Optional[int] = Field(default=5, description="Events per second to generate (1-50).")
            theaters: List[str] = Field(default_factory=list, description="Theater IDs to include.")

        llm = get_llm(temperature=0.0).with_structured_output(StreamControlConfig)
        user_query = state["messages"][-1].content

        messages = [
            SystemMessage(content=STREAM_CONTROL_PROMPT),
            HumanMessage(content=user_query)
        ]

        try:
            plan: StreamControlConfig = llm.invoke(messages)
        except Exception as e:
            return {
                "messages": [AIMessage(content=f"⚠️ Could not parse stream configuration from your request. Please try again or use the stream control panel in the header.")],
                "reasoning_steps": [f"Stream control parsing failed: {e}"]
            }

        if plan.action == "stop":
            live_streamer.stop()
            return {
                "messages": [AIMessage(content="⏹️ **Live stream stopped.** The ticket data feed has been disconnected from ClickHouse Cloud.")],
                "reasoning_steps": ["Stream control: stop command executed."]
            }

        # Build config dict — only include non-empty/non-None values
        config = {}
        if plan.movies:
            config["movies"] = plan.movies
        if plan.min_price is not None:
            config["min_price"] = plan.min_price
        if plan.max_price is not None:
            config["max_price"] = plan.max_price
        if plan.events_per_second is not None:
            config["events_per_second"] = max(1, min(50, plan.events_per_second))
        if plan.theaters:
            config["theaters"] = plan.theaters

        live_streamer.start(config)

        # Build confirmation message
        movies_str = ", ".join(plan.movies) if plan.movies else "TMDB top movies (auto)"
        theaters_str = ", ".join(plan.theaters) if plan.theaters else "all theaters"
        price_str = (
            f"${plan.min_price:.2f}–${plan.max_price:.2f}"
            if plan.min_price and plan.max_price
            else f"${plan.min_price:.2f}+" if plan.min_price
            else f"up to ${plan.max_price:.2f}" if plan.max_price
            else "default pricing"
        )
        eps = config.get("events_per_second", 5)

        msg = (
            f"🔴 **Live stream activated!** ClickHouse Cloud is now ingesting real-time ticket sales.\n\n"
            f"| Parameter | Value |\n"
            f"|---|---|\n"
            f"| **Movies** | {movies_str} |\n"
            f"| **Theaters** | {theaters_str} |\n"
            f"| **Price Range** | {price_str} |\n"
            f"| **Speed** | {eps} events/sec |\n\n"
            f"You can now query the agent for live metrics — try *'What is total revenue right now?'*"
        )

        return {
            "messages": [AIMessage(content=msg)],
            "reasoning_steps": [f"🎬 Stream control: started with config {config}"]
        }

    # ═══════════════════════════════════════════════════════════════════════════
    # Agentic Loop Nodes — Multi-Step Inspection & Self-Correction
    # ═══════════════════════════════════════════════════════════════════════════

    @staticmethod
    def resolve_entities_node(state: AgentState, config: Optional[RunnableConfig] = None) -> dict:
        """Node A — Pre-query entity resolution.

        Extracts keywords from the user's message and runs targeted
        ``positionCaseInsensitive`` lookups against ``ticket_sales`` to surface
        exact DB titles before any SQL is generated.  Set-deduplication ensures
        overlapping keyword queries never produce duplicate entries.

        Also resets all loop-control fields so each new user turn starts clean.
        """
        import re as _re

        user_query = state["messages"][-1].content
        user_id = config.get("configurable", {}).get("user_id") if config else None

        # ── 1. Extract meaningful keywords from the user query ─────────────────
        stopwords = {
            "what", "is", "are", "the", "for", "of", "show", "me", "give",
            "get", "how", "many", "much", "total", "revenue", "sales",
            "ticket", "tickets", "about", "from", "in", "a", "an", "did",
            "do", "does", "was", "were", "has", "have", "had", "been",
        }
        words = _re.findall(r'\b[A-Za-z][\w\-:]+\b', user_query)
        keywords = [w for w in words if w.lower() not in stopwords and len(w) > 2]
        # Limit to top 3 meaningful keywords to avoid query sprawl
        keywords = keywords[:3]

        # ── 2. Probe ClickHouse for each keyword ───────────────────────────────
        accumulated: list[str] = []
        reasoning: list[str] = []

        if keywords:
            from app.agent.tools import execute_clickhouse_query
            for kw in keywords:
                lookup_sql = (
                    f"SELECT DISTINCT movie_title FROM ticket_sales "
                    f"WHERE positionCaseInsensitive(movie_title, '{kw}') > 0 LIMIT 5"
                )
                result = execute_clickhouse_query.invoke({"query": lookup_sql, "user_id": user_id or ""})
                matches = [row["movie_title"] for row in result.get("data", [])]
                accumulated.extend(matches)

            # ── 3. Set-deduplicate accumulated matches ─────────────────────────
            resolved = list(set(accumulated))
            reasoning.append(
                f"🔎 resolve_entities_node: keywords={keywords} → resolved={resolved}"
            )
        else:
            resolved = []
            reasoning.append("🔎 resolve_entities_node: no meaningful keywords detected.")

        return {
            # Entity resolution output
            "resolved_entities": resolved,
            # Reset grounding hints for this fresh turn
            "available_db_titles": [],
            # Reset all loop-control fields
            "iteration_count": 0,
            "max_iterations": 5,
            "needs_retry": False,
            "last_failed_sql": None,
            # Clear stale SQL / results from a previous turn
            "generated_sql": None,
            "query_results": None,
            "reasoning_steps": reasoning,
        }

    @staticmethod
    def generate_sql_node(state: AgentState, config: Optional[RunnableConfig] = None) -> dict:
        """Node B — Contextual SQL generation with retry awareness.

        Increments the iteration counter and injects resolved entity context,
        available DB titles (populated after a zero-row retry), and the
        previous failed SQL into the system prompt so the LLM can reformulate
        intelligently rather than repeating an identical failing query.
        """
        import re as _re

        llm = get_llm(temperature=0.1)
        user_query = state["messages"][-1].content
        user_id = config.get("configurable", {}).get("user_id") if config else None

        resolved_entities: list[str] = state.get("resolved_entities") or []
        available_db_titles: list[str] = state.get("available_db_titles") or []
        last_failed_sql: str | None = state.get("last_failed_sql")
        iteration_count: int = (state.get("iteration_count") or 0) + 1
        max_iterations: int = state.get("max_iterations") or 5

        # ── 1. Build dynamic system prompt ────────────────────────────────────
        custom_schema = get_custom_table_schema(user_id)
        prompt = ANALYTICS_PROMPT

        if custom_schema:
            prompt += f"\n\nActive Custom Dataset:\n{custom_schema}\n"
            prompt += "\nCRITICAL BUSINESS RULE FOR CUSTOM DATASET:\n"
            prompt += "- If the user refers to their custom dataset, uploaded CSV, 'user_datasets', or 'custom data', you MUST query the `user_datasets` table.\n"
            prompt += f"- When querying user_datasets, you MUST ALWAYS append WHERE user_id = '{user_id}' to your query.\n"
            prompt += "- Use the correct column names from the user_datasets schema provided above."

        if live_streamer.is_active:
            prompt += "\n\nLIVE TICKET STREAM ACTIVE:\n"
            prompt += "- A real-time live ticket stream is currently running.\n"
            prompt += f"- Total events ingested so far: {live_streamer.total_events_ingested}.\n"
            prompt += "- For 'right now', 'live revenue', or 'latest sales' queries, calculate from `ticket_sales`."

        # Inject agentic loop context
        prompt += "\n\n── AGENTIC QUERY CONTEXT ──"
        prompt += f"\nUser query: '{user_query}'"
        if resolved_entities:
            prompt += f"\nMatched DB Entities (use these exact titles): {resolved_entities}"
        if available_db_titles:
            prompt += (
                f"\nAvailable titles currently in ClickHouse (use one of these if the user's "
                f"movie is not in Matched DB Entities): {available_db_titles}"
            )
        if last_failed_sql:
            prompt += f"\nPrevious failed SQL attempt (returned 0 rows — do NOT repeat this verbatim): {last_failed_sql}"
        prompt += f"\nRetry Count: {iteration_count}/{max_iterations}. Generate a corrected ClickHouse SQL query."

        # ── 2. Generate SQL ────────────────────────────────────────────────────
        messages = [SystemMessage(content=prompt)] + list(state["messages"])
        trimmed_messages = safe_trim_messages(messages)
        raw_content = llm.invoke(trimmed_messages).content
        sql_text = extract_text_content(raw_content)
        sql_response = sql_text.strip().replace("```sql", "").replace("```", "").strip()

        # ── 3. Guardrail: ensure output is valid SQL, not prose ───────────────
        valid_sql_starters = ("select", "with", "show")
        if not sql_response.lower().startswith(valid_sql_starters):
            # Use a resolved entity title if available, otherwise fall back to user query words
            if resolved_entities:
                fallback_keyword = resolved_entities[0]
            else:
                keyword_match = _re.search(r'"([^"]+)"|\'([^\']+)\'|(\b\w[\w\s\-:]+)', user_query)
                fallback_keyword = (
                    keyword_match.group(1) or keyword_match.group(2) or keyword_match.group(3)
                    if keyword_match else user_query[:40]
                ).strip()
            sql_response = (
                f"SELECT DISTINCT movie_title, count() AS ticket_count, "
                f"round(sum(ticket_price), 2) AS total_revenue "
                f"FROM ticket_sales "
                f"WHERE movie_title ILIKE '%{fallback_keyword}%' "
                f"GROUP BY movie_title ORDER BY total_revenue DESC LIMIT 20"
            )

        return {
            "generated_sql": sql_response,
            "iteration_count": iteration_count,
            "reasoning_steps": [
                f"⚙️ generate_sql_node [iter {iteration_count}/{max_iterations}]: {sql_response}"
            ],
        }

    @staticmethod
    def execute_sql_node(state: AgentState, config: Optional[RunnableConfig] = None) -> dict:
        """Node C — SQL execution with loop decision logic.

        Evaluates the query result and decides whether to:
        - Exit to ``format_response_node`` (rows found, or max retries exhausted), or
        - Loop back to ``generate_sql_node`` (zero rows, retries remaining).

        On a zero-row retry it fetches the 10 most recent distinct titles from
        ClickHouse and writes them to ``available_db_titles`` so the next
        generate_sql_node pass has real grounding data to work with.
        """
        sql_query: str = state.get("generated_sql") or ""
        iteration_count: int = state.get("iteration_count") or 0
        max_iterations: int = state.get("max_iterations") or 5
        user_id = config.get("configurable", {}).get("user_id") if config else None

        from app.agent.tools import execute_clickhouse_query

        # ── 1. Execute the generated SQL ───────────────────────────────────────
        query_result = execute_clickhouse_query.invoke({"query": sql_query, "user_id": user_id or ""})
        row_count: int = query_result.get("row_count", 0)

        # ── 2. Evaluate & decide ───────────────────────────────────────────────
        if row_count > 0:
            # ✅ Success — exit the loop
            return {
                "query_results": query_result.get("data", []),
                "needs_retry": False,
                "last_failed_sql": None,
                "reasoning_steps": [
                    f"✅ execute_sql_node: query returned {row_count} rows. Exiting loop."
                ],
            }

        # Zero rows returned ────────────────────────────────────────────────────
        if iteration_count < max_iterations:
            # 🔄 Retry — fetch actual available titles to ground the next attempt
            hint_sql = "SELECT DISTINCT movie_title FROM ticket_sales LIMIT 10"
            hint_result = execute_clickhouse_query.invoke({"query": hint_sql, "user_id": user_id or ""})
            available_titles = [row["movie_title"] for row in hint_result.get("data", [])]

            return {
                "query_results": [],
                "needs_retry": True,
                "last_failed_sql": sql_query,
                # Inject grounding titles so generate_sql_node sees real ClickHouse data
                "available_db_titles": available_titles,
                "reasoning_steps": [
                    f"🔄 execute_sql_node [iter {iteration_count}/{max_iterations}]: 0 rows. "
                    f"Retrying. Available titles hint: {available_titles}"
                ],
            }

        # 🛑 Max retries exhausted — give up gracefully
        return {
            "query_results": [],
            "needs_retry": False,
            "last_failed_sql": sql_query,
            "reasoning_steps": [
                f"🛑 execute_sql_node: max retries ({max_iterations}) reached without matching rows."
            ],
        }

    @staticmethod
    def format_response_node(state: AgentState, config: Optional[RunnableConfig] = None) -> dict:
        """Node D — Executive summary generation.

        Reads ``query_results`` and ``generated_sql`` from state and produces
        a concise AI summary for the end user.  Handles the exhausted-retry
        case by generating an explanatory response instead of an empty answer.
        """
        llm = get_llm(temperature=0.1)
        user_query = state["messages"][-1].content
        query_result = state.get("query_results") or []
        sql_query = state.get("generated_sql") or ""
        iteration_count = state.get("iteration_count") or 0
        max_iterations = state.get("max_iterations") or 5
        available_db_titles = state.get("available_db_titles") or []

        # ── Detect exhausted-retry case ────────────────────────────────────────
        exhausted = (
            len(query_result) == 0
            and iteration_count >= max_iterations
        )

        if exhausted:
            hint = ""
            if available_db_titles:
                hint = (
                    f" Currently active titles in the database include: "
                    f"{', '.join(available_db_titles[:5])}."
                )
            analysis_prompt = (
                f"User Query: '{user_query}'\n"
                f"Status: Max retries ({max_iterations}) reached without finding matching rows.\n"
                f"Generated SQL (last attempt): {sql_query}\n"
                f"{hint}\n"
                f"Explain to the user that no matching data was found after {max_iterations} attempts, "
                f"suggest checking the movie title spelling or trying a different query, and list the "
                f"available titles if provided."
            )
        else:
            analysis_prompt = (
                f"User Query: '{user_query}'\n"
                f"Generated SQL: {sql_query}\n"
                f"Data Output: {query_result}\n"
                f"Provide a concise executive summary."
            )

        trimmed = safe_trim_messages([HumanMessage(content=analysis_prompt)])
        summary = extract_text_content(llm.invoke(trimmed).content)

        return {
            "messages": [AIMessage(content=summary)],
            "reasoning_steps": [
                f"📋 format_response_node: summary generated "
                f"({'exhausted' if exhausted else f'{len(query_result)} rows'})."
            ],
        }