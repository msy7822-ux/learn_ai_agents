import uuid
import streamlit as st
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from langchain_core.messages import AIMessage

# agent_coreからエージェントをインポートする
from agent_core import agent


def init_session_state():
    """セッションの状態を初期化する"""
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # UI側で参照しているキー名に合わせる
    if "waiting_for_approval" not in st.session_state:
        st.session_state.waiting_for_approval = False

    if "tool_info" not in st.session_state:
        st.session_state.tool_info = None

    if "final_result" not in st.session_state:
        st.session_state.final_result = None

    if "thread_id" not in st.session_state:
        st.session_state.thread_id = None

    # LangGraphへ渡す初回入力（UI表示用messagesとは分離）
    if "latest_user_input" not in st.session_state:
        st.session_state.latest_user_input = None


def reset_session():
    """セッションの状態をリセットする"""
    st.session_state.messages = []
    st.session_state.waiting_for_approval = False
    st.session_state.tool_info = None
    st.session_state.final_result = None
    st.session_state.thread_id = None
    st.session_state.latest_user_input = None


# セッション状態の初期化を実行
init_session_state()


# エージェントの実行関数
def run_agent(resume: str | None = None):
    """エージェントを実行し、結果を処理する"""
    # AIエージェント呼び出しに使うconfigurationの作成
    config = {"configurable": {"thread_id": st.session_state.thread_id}}

    # interrupt からの再開時は Command(resume=...) を渡す必要がある
    # NOTE: agent_core 側は LangChain BaseMessage を期待するため、
    # UI表示用の st.session_state.messages(dict) は入力に使わない
    if resume:
        agent_input = Command(resume=resume)
    else:
        if not st.session_state.latest_user_input:
            raise RuntimeError("latest_user_input が未設定です。")
        agent_input = [HumanMessage(content=st.session_state.latest_user_input)]

    # 結果を処理
    with st.spinner("処理中...", show_time=True):
        for chunk in agent.stream(agent_input, config=config, mode="updates"):
            for task_name, result in chunk.items():
                # updates では途中経過で result が None になることがあるため安全にスキップ
                if result is None:
                    continue

                # interruptの場合
                if task_name == "__interrupt__":
                    st.session_state.tool_info = result[0].value
                    st.session_state.waiting_for_approval = True
                    return

                # 最終回答の場合
                elif task_name == "agent":
                    # 返り値の形が環境/バージョンで揺れるので吸収する
                    if hasattr(result, "content"):
                        st.session_state.final_result = result.content
                    elif isinstance(result, dict) and "content" in result:
                        st.session_state.final_result = result["content"]
                    else:
                        st.session_state.final_result = str(result)
                    st.session_state.waiting_for_approval = False
                    st.session_state.tool_info = None

                # LLM推論の場合
                elif task_name == "invoke_llm":
                    # chunkキー名の誤り（involve_llm）を回避し、resultを参照する
                    if isinstance(result.content, list):
                        for content in result.content:
                            if content["type"] == "text":
                                st.session_state.messages.append(
                                    {
                                        "role": "assistant",
                                        "content": content["text"],
                                    }
                                )
                    else:
                        # テキストが1本の場合も表示できるようにする
                        if isinstance(result, AIMessage) and isinstance(
                            result.content, str
                        ):
                            st.session_state.messages.append(
                                {"role": "assistant", "content": result.content}
                            )

                # ツール実行の場合
                elif task_name == "use_tool":
                    st.session_state.messages.append(
                        {
                            "role": "assistant",
                            "content": "ツールを実行！",
                        }
                    )


# ユーザーからのツール実行の承認・拒否を受け取る関数
def feedback():
    """フィードバックを取得し、エージェントに通知する関数"""
    approve_column, deny_column = st.columns(2)

    feedback_result = None

    with approve_column:
        if st.button("承認"):
            feedback_result = "APPROVE"

    with deny_column:
        if st.button("拒否"):
            feedback_result = "DENY"

    # いずれかのボタンが押下された場合
    return feedback_result


def app():
    # タイトルの設定
    st.title("WebリサーチAIエージェント")

    # メッセージ表示エリア
    for msg in st.session_state.messages:
        if msg["role"] == "user":
            st.chat_message("user").write(msg["content"])
        else:
            st.chat_message("assistant").write(msg["content"])

    # ツール承認の確認（待機中のみ表示）
    if st.session_state.waiting_for_approval:
        if st.session_state.tool_info:
            st.info(st.session_state.tool_info["args"])
            if st.session_state.tool_info.get("name") == "web_file":
                with st.container(height=400):
                    st.html(st.session_state.tool_info["html"], width="stretch")

            feedback_result = feedback()
            if feedback_result:
                st.chat_message("user").write(feedback_result)
                # いったん待機状態を解除してから、interruptをresumeして継続実行する
                st.session_state.waiting_for_approval = False
                run_agent(resume=feedback_result)
                st.rerun()
        else:
            st.info("ツールの承認待ちです（ツール情報が未設定）。")

    # 最終結果の表示（待機中でないとき）
    if st.session_state.final_result and not st.session_state.waiting_for_approval:
        st.subheader("最終結果")
        st.success(st.session_state.final_result)

    # ユーザーの入力エリア（待機中は非表示）
    if not st.session_state.waiting_for_approval:
        user_input = st.chat_input("メッセージを入力してください。")
        if user_input:
            reset_session()

            # スレッドIDを設定
            st.session_state.thread_id = str(uuid.uuid4())

            # ユーザーメッセージを追加
            st.chat_message("user").write(user_input)
            st.session_state.messages.append(
                {
                    "role": "user",
                    "content": user_input,
                }
            )

            # エージェントを実行
            st.session_state.latest_user_input = user_input
            run_agent()
            st.rerun()
    else:
        st.info("ツールの承認待ちです。上記のボタンで応答してください。")


if __name__ == "__main__":
    app()
