from strands import Agent, tool
from dotenv import load_dotenv
import feedparser

load_dotenv()


@tool
def get_aws_updates(service_name: str):
    ## AWSのwhats newのRSSを取得する
    url = f"https://aws.amazon.com/about-aws/whats-new/recent/feed/"
    feed = feedparser.parse(url)
    result = []

    for entry in feed.entries:
        if service_name.lower() in entry.title.lower():
            result.append(
                {
                    "published": entry.get("published", "N/A"),
                    "summary": entry.get("summary", ""),
                }
            )

            if len(result) >= 3:
                break

    return result


modelId = "global.anthropic.claude-opus-4-5-20251101-v1:0"
agent = Agent(model=modelId, tools=[get_aws_updates])

messages = [
    {"role": "user", "content": [{"text": "AWSのECSの最新情報を教えてください"}]},
]

# strands-agents の Agent は `run()` ではなく呼び出し（__call__）で実行する
result = agent(messages)

# `result.message.content` は text/toolUse 等のブロック配列
texts = [c["text"] for c in result.message.get("content", []) if "text" in c]
if texts:
    print("\n".join(texts))
else:
    print(result.to_dict())
