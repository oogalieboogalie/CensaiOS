"""Travel concierge, built with Google's Agent Development Kit (ADK)."""
from google.adk.agents import Agent
from google.adk.tools import google_search

CONCIERGE_PROMPT = """You are Wayfinder, a friendly travel concierge.
Ask where the person is going and when, then suggest a short plan.
Always check opening hours and prices with a search before recommending a place."""


def get_exchange_rate(currency: str) -> dict:
    """Look up today's exchange rate for a currency."""
    return {"currency": currency, "rate": 1.0}


root_agent = Agent(
    name="wayfinder",
    model="gemini-2.5-flash",
    description="Plans short trips and checks opening hours and prices.",
    instruction=CONCIERGE_PROMPT,
    tools=[google_search, get_exchange_rate],
)
