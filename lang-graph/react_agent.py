from langgraph.prebuilt import create_react_agent
from langchain.tools import tool
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

import os
from dotenv import load_dotenv
from typing import Any

load_dotenv()


llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", api_key=os.getenv("GEMINI_API_KEY")
)


@tool
def add(a: int, b: int) -> int:
    "add two values"
    return a + b


@tool
def multiply(a: int, b: int) -> int:
    "multiply two values"
    return a * b


for i, t in enumerate([add, multiply]):
    print(f"Tool_{i+1}:")
    print(f"Name: {t.name} \nDescription: {t.description}")
    print("-" * 50)

agent = create_react_agent(llm, [add, multiply])  # 　ツールはリストで渡す

from langgraph.checkpoint.memory import InMemorySaver

checkpointer = InMemorySaver()

agent_with_memory = create_react_agent(
    model=llm, tools=[add, multiply], checkpointer=checkpointer
)

session_id = "test_session"
config = {"configurable": {"thread_id": session_id}}


def content_to_text(content: Any) -> str:
    """LangChainのmessage.content(str | list[dict])を人間が読める文字列へ正規化する。"""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for p in content:
            if isinstance(p, dict) and "text" in p and isinstance(p["text"], str):
                parts.append(p["text"])
        if parts:
            return "".join(parts)
    return str(content)


# first input
user_input1 = "Add 2 and 4"
response = agent_with_memory.invoke(
    {"messages": [HumanMessage(content=user_input1)]}, config=config
)
print("Answer 1: ", content_to_text(response["messages"][-1].content))

# second input
user_input2 = "Multiply that by 5"
response = agent_with_memory.invoke(
    {"messages": [HumanMessage(content=user_input2)]}, config=config
)
print("Answer 2: ", content_to_text(response["messages"][-1].content))

# third input
user_input3 = "What was the first question?"
response = agent_with_memory.invoke(
    {"messages": [HumanMessage(content=user_input3)]}, config=config
)
print("Answer 3: ", content_to_text(response["messages"][-1].content))
