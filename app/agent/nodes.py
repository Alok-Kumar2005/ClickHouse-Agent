import json
from typing import Literal, List, Optional
from pydantic import BaseModel, Field
from langchain_core.messages import AIMessage

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


class BoxOfficeAgentNodes:
    
    @staticmethod
    def supervisor_node(state: AgentState) -> dict:
        """Using structured output """
        llm = get_llm(temperature=0.0).with_structured_output(IntentClassification)
        
        last_message = state["messages"][-1].content
        result: IntentClassification = llm.invoke([
            ("system", SUPERVISOR_PROMPT),
            ("user", last_message)
        ])
        
        return {
            "current_intent": result.intent,
            "reasoning_steps": [f"🔍 Supervisor classified intent as '{result.intent}' ({result.reasoning})"]
        }

    @staticmethod
    def analytics_node(state: AgentState) -> dict:
        """Generates ClickHouse SQL, executes query, and summarizes findings."""
        llm = get_llm(temperature=0.1)
        user_query = state["messages"][-1].content
        
        # 1. Generate SQL
        sql_response = llm.invoke([
            ("system", ANALYTICS_PROMPT),
            ("user", user_query)
        ]).content.strip().replace("```sql", "").replace("```", "").strip()
        
        # 2. Execute against ClickHouse
        query_result = execute_clickhouse_query.invoke({"query": sql_response})
        
        # 3. Executive Data Summary
        analysis_prompt = f"User Query: '{user_query}'\nGenerated SQL: {sql_response}\nData Output: {query_result}\nProvide a concise executive summary."
        summary = llm.invoke([("user", analysis_prompt)]).content
        
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
        plan: ActionPlan = llm.invoke([
            ("system", ACTION_PROMPT),
            ("user", prompt)
        ])
        
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