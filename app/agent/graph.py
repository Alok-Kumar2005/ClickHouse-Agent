from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.base import BaseCheckpointSaver

from app.agent.state import AgentState
from app.agent.memory import checkpointer
from app.agent.nodes import BoxOfficeAgentNodes


class BoxOfficeAgentGraph:
    def __init__(self, memory_checkpointer: BaseCheckpointSaver = checkpointer):
        self.checkpointer = memory_checkpointer
        self.nodes = BoxOfficeAgentNodes()
        self.workflow = self._build_graph()

    @staticmethod
    def route_intent(state: AgentState) -> str:
        intent = state.get("current_intent", "general_chat")
        if intent == "analytics_query":
            return "resolve_entities_node"   # entry point for the agentic loop
        elif intent == "anomaly_action":
            return "action_node"
        elif intent == "stream_control":
            return "stream_control_node"
        return "general_chat_node"

    @staticmethod
    def should_continue(state: AgentState) -> str:
        """Conditional edge: loop back to rewrite SQL or exit to response formatter."""
        if state.get("needs_retry") and state.get("iteration_count", 0) < state.get("max_iterations", 5):
            return "generate_sql_node"
        return "format_response_node"

    def _build_graph(self) -> StateGraph:
        builder = StateGraph(AgentState)

        # ── Existing nodes (unchanged) ─────────────────────────────────────────
        builder.add_node("supervisor_node", self.nodes.supervisor_node)
        builder.add_node("general_chat_node", self.nodes.general_chat_node)
        builder.add_node("analytics_node", self.nodes.analytics_node)      # kept as fallback
        builder.add_node("action_node", self.nodes.action_node)
        builder.add_node("stream_control_node", self.nodes.stream_control_node)

        # ── Agentic loop nodes ─────────────────────────────────────────────────
        builder.add_node("resolve_entities_node", self.nodes.resolve_entities_node)
        builder.add_node("generate_sql_node", self.nodes.generate_sql_node)
        builder.add_node("execute_sql_node", self.nodes.execute_sql_node)
        builder.add_node("format_response_node", self.nodes.format_response_node)

        # ── Entry edge ────────────────────────────────────────────────────────
        builder.add_edge(START, "supervisor_node")

        # ── Supervisor routing ────────────────────────────────────────────────
        builder.add_conditional_edges(
            "supervisor_node",
            self.route_intent,
            {
                "resolve_entities_node": "resolve_entities_node",  # analytics → new loop
                "general_chat_node": "general_chat_node",
                "action_node": "action_node",
                "stream_control_node": "stream_control_node",
            },
        )

        # ── Agentic analytics loop ─────────────────────────────────────────────
        # resolve → generate → execute ─┬→ format → END  (success / exhausted)
        #                      ↑         └→ generate      (retry)
        builder.add_edge("resolve_entities_node", "generate_sql_node")
        builder.add_edge("generate_sql_node", "execute_sql_node")
        builder.add_conditional_edges(
            "execute_sql_node",
            self.should_continue,
            {
                "generate_sql_node": "generate_sql_node",
                "format_response_node": "format_response_node",
            },
        )
        builder.add_edge("format_response_node", END)

        # ── Terminal edges for non-analytics paths ─────────────────────────────
        builder.add_edge("general_chat_node", END)
        builder.add_edge("analytics_node", END)      # fallback path exit
        builder.add_edge("action_node", END)
        builder.add_edge("stream_control_node", END)

        return builder

    def compile(self):
        return self.workflow.compile(checkpointer=self.checkpointer)


# Instantiate the graph instance
graph_builder = BoxOfficeAgentGraph()
graph = graph_builder.compile()