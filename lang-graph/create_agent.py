import asyncio
import boto3
import operator
import os
import re

from langchain_core.messages import AnyMessage, AIMessage, HumanMessage, SystemMessage
from langchain.tools import tool
from langchain_tavily import TavilySearch
from langchain.chat_models import init_chat_model
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel
from typing import Annotated, Dict, List, Union

from dotenv import load_dotenv

load_dotenv()


class AgentState(BaseModel):
    messages: Annotated[list[AnyMessage], operator.add]


builder = StateGraph(AgentState)


web_search_tool = TavilySearch(max_results=3)


@tool
def send_aws_sns(text: str):
    """Send a message to an AWS SNS topic"""
    topic_arn = (os.getenv("AWS_SNS_TOPIC_ARN") or "").strip()
    if not topic_arn:
        raise RuntimeError(
            "AWS_SNS_TOPIC_ARN が未設定です。.env に SNS トピックの ARN "
            "を設定してください。"
        )

    sns = boto3.client("sns")
    sns.publish(TopicArn=topic_arn, Message=text)
    return "Message sent to AWS SNS topic"


tools = [web_search_tool, send_aws_sns]
modelId = "global.anthropic.claude-opus-4-5-20251101-v1:0"

llm_with_tools = init_chat_model(
    model=modelId,
    model_provider="bedrock_converse",
).bind_tools(tools)


system_prompt = """
あなたの責務はユーザーからの質問を調査し、結果を要約してAWS SNSに送信することです。・
検索は一回のみとしてください。
"""


async def agent(state: AgentState) -> Dict[str, List[AIMessage]]:
    response = await llm_with_tools.ainvoke(
        [SystemMessage(content=system_prompt)] + state.messages
    )

    return {"messages": [response]}


builder.add_node("agent", agent)
builder.add_node("tools", ToolNode(tools))


## ツールNodeがEnd Nodeに遷移する関数
def route_node(state: AgentState) -> Union[str]:
    last_message = state.messages[-1]
    if not last_message.tool_calls:
        return END
    return "tools"


builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", route_node)
builder.add_edge("tools", "agent")

graph = builder.compile()


# AIエージェントの呼び出しと同時に、ユーザーの質問を初期メッセージとしてグラフを起動する
async def main():
    question = "LangGraphの基本を優しく解説して"
    response = await graph.ainvoke({"messages": [HumanMessage(content=question)]})

    return response


if __name__ == "__main__":
    result = asyncio.run(main())
    print(result)
