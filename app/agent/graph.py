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
            return "analytics_node"
        elif intent == "anomaly_action":
            return "action_node"
        return "general_chat_node"

    def _build_graph(self) -> StateGraph:
        builder = StateGraph(AgentState)

        # Register nodes from the BoxOfficeAgentNodes instance
        builder.add_node("supervisor_node", self.nodes.supervisor_node)
        builder.add_node("general_chat_node", self.nodes.general_chat_node)
        builder.add_node("analytics_node", self.nodes.analytics_node)
        builder.add_node("action_node", self.nodes.action_node)

        # Define edge flow
        builder.add_edge(START, "supervisor_node")
        builder.add_conditional_edges(
            "supervisor_node",
            self.route_intent,
            {
                "general_chat_node": "general_chat_node",
                "analytics_node": "analytics_node",
                "action_node": "action_node",
            },
        )

        builder.add_edge("general_chat_node", END)
        builder.add_edge("analytics_node", END)
        builder.add_edge("action_node", END)

        return builder

    def compile(self):
        return self.workflow.compile(checkpointer=self.checkpointer)


# Instantiate the graph instance
graph_builder = BoxOfficeAgentGraph()
graph = graph_builder.compile()