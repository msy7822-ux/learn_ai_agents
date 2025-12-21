import { Agent } from "@mastra/core/agent";
import { bedrock } from "@ai-sdk/amazon-bedrock";

// エージェントを定義
export const assistantAgent = new Agent({
  name: "assistant",
  instructions:
    "あなたは親切で知識豊富なAIアシスタントです。ユーザーにの質問に対押してわかりやすく丁寧に回答してください。",
  model: bedrock("global.anthropic.claude-opus-4-5-20251101-v1:0"),
});
