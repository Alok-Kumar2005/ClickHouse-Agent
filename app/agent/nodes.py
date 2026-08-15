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
from app.agent.prompts import SUPERVISOR_PROMPT, ANALYTICS_PROMPT, ACTION_PROMPT
from app.agent.tools import execute_clickhouse_query

class IntentClassification(BaseModel):
    intent: Literal["general_chat", "analytics_query", "anomaly_action"] = Field(
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
        
        # 1. Generate SQL with full conversation history
        messages = [
            SystemMessage(content=prompt)
        ] + list(state["messages"])
        trimmed_messages = safe_trim_messages(messages)
        
        sql_response = llm.invoke(trimmed_messages).content.strip().replace("```sql", "").replace("```", "").strip()
        
        # 2. Execute against ClickHouse
        query_result = execute_clickhouse_query.invoke({"query": sql_response, "user_id": user_id or ""})
        
        # 3. Executive Data Summary
        analysis_prompt = f"User Query: '{user_query}'\nGenerated SQL: {sql_response}\nData Output: {query_result}\nProvide a concise executive summary."
        trimmed_summary_messages = safe_trim_messages([
            HumanMessage(content=analysis_prompt)
        ])
        summary = llm.invoke(trimmed_summary_messages).content
        
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