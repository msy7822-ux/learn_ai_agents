import boto3
import os
from dotenv import load_dotenv
from botocore.exceptions import NoCredentialsError
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

load_dotenv()

# リージョンは env を優先し、未設定なら us-east-1 をデフォルトにする
region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
profile = os.getenv("AWS_PROFILE")
session = (
    boto3.Session(region_name=region, profile_name=profile)
    if profile
    else boto3.Session(region_name=region)
)
client = session.client("bedrock-runtime")
modelId = "global.anthropic.claude-opus-4-5-20251101-v1:0"


def get_jp_holiday(year: int):
    # NOTE: `holiday-jp.github.io` ではなく `holidays-jp.github.io` が正しいエンドポイント。
    # 例: https://holidays-jp.github.io/api/v1/date.json
    #
    # 補足: このAPIは年指定のパラメータが効かず、複数年分が返ることがあるため
    #      ここで指定年だけにフィルタします。
    url = "https://holidays-jp.github.io/api/v1/date.json"

    req = Request(url, headers={"User-Agent": "agent_book/1.0 (urllib)"})
    try:
        with urlopen(req, timeout=10) as response:
            data = response.read().decode("utf-8")
            holidays = json.loads(data)  # {"YYYY-MM-DD": "祝日名", ...}
            year_prefix = f"{year}-"
            filtered = {k: v for k, v in holidays.items() if k.startswith(year_prefix)}
            return filtered
    except HTTPError as e:
        raise RuntimeError(
            f"祝日APIがHTTPエラーを返しました: {e.code} {e.reason}\n"
            f"URL: {url}\n"
            "エンドポイントが変更/廃止された可能性があります。"
        ) from e
    except URLError as e:
        raise RuntimeError(
            f"祝日APIへの接続に失敗しました: {e.reason}\nURL: {url}"
        ) from e


tools = [
    {
        "toolSpec": {
            "name": "get_jp_holiday",
            "description": "日本の祝日を取得する",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "year": {"type": "integer", "description": "年"},
                    },
                    "required": ["year"],
                }
            },
        },
    }
]

input = "2025年の7月の日本の祝日を教えてください"

# ---
# 一回目の推論
# ---
print("一回目の推論")
print("ユーザーの入力: ", input)

response = client.converse(
    modelId=modelId,
    messages=[{"role": "user", "content": [{"text": input}]}],
    toolConfig={
        "tools": tools,
    },
)

message = response["output"]["message"]
texts = [c["text"] for c in message.get("content", []) if "text" in c]
if texts:
    print("AIの回答: ", "\n".join(texts))
else:
    # 例: ツール呼び出し要求のみで、テキストが返らないケース
    tool_uses = [c["toolUse"] for c in message.get("content", []) if "toolUse" in c]
    if tool_uses:
        tu = tool_uses[0]
        print(
            "AIの回答: ",
            f"(toolUse) name={tu.get('name')} input={tu.get('input')}",
        )
    else:
        print("AIの回答: (textなし)", message.get("content"))

# Tool Useの要否を判定
tool_use = None
for content in message["content"]:
    if "toolUse" in content:
        tool_use = content["toolUse"]
        break

# ---
# 二回目の推論
# ---
print("二回目の推論")

if tool_use:
    year = tool_use["input"]["year"]
    holidays = get_jp_holiday(year)
    tool_result = {
        "year": year,
        "holidays": holidays,
        "count": len(holidays),
    }

    print("Tool Result: ", tool_result)
    print()

    messages = [
        {
            "role": "user",
            "content": [{"text": input}],
        },
        {
            "role": "assistant",
            "content": message["content"],
        },
        {
            # Tool結果は user ロールで toolResult ブロックとして返す（content は配列）
            "role": "user",
            "content": [
                {
                    "toolResult": {
                        "toolUseId": tool_use["toolUseId"],
                        "content": [{"json": tool_result}],
                    }
                }
            ],
        },
    ]

    final_response = client.converse(
        modelId=modelId,
        messages=messages,
        toolConfig={
            "tools": tools,
        },
    )

    final_message = final_response["output"]["message"]
    final_texts = [c["text"] for c in final_message.get("content", []) if "text" in c]
    print(
        "AIの回答: ",
        "\n".join(final_texts) if final_texts else final_message.get("content"),
    )
else:
    print("Tool Use: None")
    # toolUse も text も無い場合があるので、上と同じ表示ロジックにする
    if texts:
        print("AIの回答: ", "\n".join(texts))
    else:
        print("AIの回答: (textなし)", message.get("content"))
    print("Tool Use: None")
