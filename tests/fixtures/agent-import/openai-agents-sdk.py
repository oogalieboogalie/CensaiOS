# OpenAI Agents SDK (pip install openai-agents)
from agents import Agent, WebSearchTool, function_tool


@function_tool
def lookup_competitor(name: str) -> str:
    """Return what we know about a competitor."""
    return name


market_scout = Agent(
    name="Market Scout",
    instructions=(
        "You research a market for a small business. "
        "Find three competitors, their prices, and one gap nobody covers."
    ),
    model="gpt-4.1-mini",
    tools=[WebSearchTool(), lookup_competitor],
)
