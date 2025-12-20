import asyncio
import operator
import os
from langchain.chat_models import init_chat_model
from langchain_core.messages import AnyMessage, AIMessage, HumanMessage, SystemMessage
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel
from typing import Annotated, Dict, List, Union

from dotenv import load_dotenv

load_dotenv()


mcp_client = None
tools = None
llm_with_tools = None


async def initialize_llm():
    """MCPクライアントとツールを初期化する"""
    global mcp_client, tools, llm_with_tools

    # filesystem MCP に渡す許可ディレクトリは存在している必要があるため、
    # 起動前に作成しておく（存在していれば何もしない）
    docs_dir = os.path.abspath(os.path.join(os.getcwd(), "docs"))
    os.makedirs(docs_dir, exist_ok=True)

    mcp_client = MultiServerMCPClient(
        {
            # filesystem MCP
            "file-system": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"],
                "transport": "stdio",
            },
            # AWS Knowledge MCPサーバー
            "aws-knowledge-mcp-server": {
                "url": "https://knowledge-mcp.global.api.aws",
                "transport": "streamable_http",
            },
        }
    )

    model_id = "global.anthropic.claude-opus-4-5-20251101-v1:0"
    tools = await mcp_client.get_tools()

    llm_with_tools = init_chat_model(
        model=model_id, model_provider="bedrock_converse"
    ).bind_tools(tools)


# ステートの定義
class AgentState(BaseModel):
    messages: Annotated[list[AnyMessage], operator.add]


system_prompt = """
あなたの責務はAWSのドキュメントを検索して、Markdown形式としてファイルに出力することです。
 - 検索後、Markdown形式に出力してください。
 - 検索は最大で二回までとして、その時点での情報を出力するようにしてください。
"""


async def agent(state: AgentState) -> Dict[str, List[AIMessage]]:
    response = await llm_with_tools.ainvoke(
        [SystemMessage(content=system_prompt)] + state.messages
    )
    return {"messages": [response]}


# ルーティング関数：toolsノードかENDノードへ遷移する
def route_node(state: AgentState) -> Union[str]:
    last_message = state.messages[-1]
    if not isinstance(last_message, AIMessage):
        raise ValueError(
            "「AIMessage」以外のメッセージです。遷移が不正な可能性があります。"
        )

    if not last_message.tool_calls:
        return END  # ENDノードへ遷移
    return "tools"  # toolsノードへ遷移


async def main():
    # MCPクライアントとツールを初期化
    await initialize_llm()

    # グラフの構築
    builder = StateGraph(AgentState)
    builder.add_node("agent", agent)
    builder.add_node("tools", ToolNode(tools))
    builder.add_edge(START, "agent")
    builder.add_conditional_edges("agent", route_node)
    builder.add_edge("tools", "agent")
    graph = builder.compile()

    question = "Amazon Bedrockで利用可能なモデルプロバイダーを教えてください。"

    # グラフの実行
    result = await graph.ainvoke({"messages": [HumanMessage(content=question)]})
    print(result)
    return result


if __name__ == "__main__":
    asyncio.run(main())
