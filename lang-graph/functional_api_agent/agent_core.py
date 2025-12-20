from botocore.config import Config
from langchain.chat_models import init_chat_model
from langchain_community.agent_toolkits import FileManagementToolkit
from langchain_tavily import TavilySearch
from langchain_core.messages import (
    AIMessage,
    SystemMessage,
    BaseMessage,
    ToolMessage,
    ToolCall,
)
from langgraph.types import interrupt
from langgraph.checkpoint.memory import MemorySaver
from langgraph.func import entrypoint, task
from langgraph.graph import add_messages

from dotenv import load_dotenv

load_dotenv()

model_id = "global.anthropic.claude-opus-4-5-20251101-v1:0"
model_provider = "bedrock_converse"

# ツールの定義
web_search = TavilySearch(max_results=2, topic="general")

working_directory = "report"
# ローカルファイルウィ扱うツールキット
file_toolkit = FileManagementToolkit(
    root_dir=str(working_directory),
    selected_tools=["write_file"],  # ファイルへの書き込みツールを指定
)
write_file = file_toolkit.get_tools()[0]

# 使用するツールキットのリスト
tools = [web_search, write_file]
tools_by_name = {tool.name: tool for tool in tools}

config = Config(
    read_timeout=300,
)

llm_with_tools = init_chat_model(
    model=model_id,
    model_provider=model_provider,
    config=config,
).bind_tools(tools)

system_prompt = """
あなたの責務はユーザーからのリクエストを調査し、調査結果をファイルに出力することです。
- ユーザーのリクエストの調査にWeb検索が必要であれば、Web検索ツールを使ってください。
- 必要な情報が集まったと判断したら検索は終了してください。
- 検索は最大で2回までとしてください。
- ファイル出力はHTML形式(.html)に変換して保存してください。
  - Web検索が拒否された場合、Web検索を中断してください。
  - レポート保存を拒否された場合、レポート作成を中止し、内容をユーザーに直接伝えてください。
"""


# LLMを呼び出すタスク
@task
def invoke_llm(messages: list[BaseMessage]) -> AIMessage:
    response = llm_with_tools.invoke([SystemMessage(content=system_prompt)] + messages)
    return response


# ツールを実行するタスク
@task
def use_tool(tool_call: ToolCall) -> ToolMessage:
    tool = tools_by_name[tool_call["name"]]
    observation = tool.invoke(tool_call["args"])

    return ToolMessage(content=observation, tool_call_id=tool_call["id"])


# ask_humanタスク （関数）
# Human-in-the-Loopのためのタスクの中心的な役割を担います。
def ask_human(tool_call: ToolCall):
    tool_name = tool_call["name"]
    tool_args = tool_call.get("args", {}) or {}
    tool_data = {"name": tool_name}

    # NOTE: ここは tool_args(dict) ではなく tool_name(str) で分岐する
    lines: list[str] = [f"* ツール名", f"  - {tool_name}"]

    if tool_name == web_search.name:
        lines.append("* 引数")
        if isinstance(tool_args, dict):
            for key, value in tool_args.items():
                lines.append(f"  - {key}: {value}")
        else:
            lines.append(f"  - {tool_args}")

    elif tool_name == write_file.name:
        filename = tool_args.get("filename", "") if isinstance(tool_args, dict) else ""
        content = tool_args.get("content", "") if isinstance(tool_args, dict) else ""
        lines.append("* ファイル名")
        lines.append(f"  - {filename}")
        lines.append("* ファイル内容")
        lines.append(f"  - {content}")

    else:
        # 予期しないツールでも落とさず、情報だけ渡す
        lines.append("* 引数")
        lines.append(f"  - {tool_args}")

    tool_data["args"] = "\n".join(lines)
    feedback = interrupt(tool_data)

    if feedback == "APPROVE":
        return tool_call

    return ToolMessage(
        content="ツールの利用が拒否されたため、処理を終了してください。",
        name=tool_name,
        tool_call_id=tool_call["id"],
    )


# ---
# Human in the Loop のAI agentではagent関数内部ではwhileによる無限ループで
# ツール実行とLLM推論を繰り返しています。
# LLMがこれ以上ツール実行は不要と判断した場合に、無限ループを抜けて処理を終了する。
# ---

# ツールのリストはadd_messagesで統合する
# チェックポイインターの設定
checkpointer = MemorySaver()


@entrypoint(checkpointer)
def agent(messages):
    # LLMの呼び出し
    llm_response = invoke_llm(messages).result()

    # ツールの呼び出しがある限り繰り返す
    while True:
        # 直近のAIMessage（toolUse を含む可能性あり）を必ず履歴に追加する
        messages = add_messages(messages, [llm_response])

        if not llm_response.tool_calls:
            break

        approved_tool_calls: list[ToolCall] = []
        tool_messages: list[ToolMessage] = []

        # 各ツール呼び出しに対してユーザーの承認を求める
        # - APPROVE: tool_call をそのまま実行
        # - DENY: toolUse に対応する toolResult(ToolMessage) を必ず履歴に残す
        for tool_call in llm_response.tool_calls:
            feedback = ask_human(tool_call)
            if isinstance(feedback, ToolMessage):
                tool_messages.append(feedback)
            else:
                approved_tool_calls.append(feedback)

        # 承認されたツールを実行
        tool_futures = []
        for tool_call in approved_tool_calls:
            tool_futures.append(use_tool(tool_call))

        # Future が完了するのを待って結果だけを集める
        for future in tool_futures:
            tool_messages.append(future.result())

        # toolResult を履歴に追加（承認・拒否どちらも含む）
        if tool_messages:
            messages = add_messages(messages, tool_messages)

        # LLMの呼び出し
        llm_response = invoke_llm(messages).result()

    return llm_response
