import { createWorkflow, createStep } from "@mastra/core/workflows";
import { confluenceSearchPagesTool } from "../tools/confluence";
import { confluenceGetPageDetailTool } from "../tools/confluence";
import { assistantAgent } from "../agents";
import { z } from "zod";

/**
 * ツールからステップを作成
 * Mastraの強みとして、ツールをそのままワークフローの1ステップにすることができる
 */
const confluenceSearchPagesStep = createStep(confluenceSearchPagesTool);
const confluenceGetPageDetailStep = createStep(confluenceGetPageDetailTool);

export const handsOnWorkflow = createWorkflow({
  id: "hands-on",
  description: "ハンズオンのワークフロー",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "検索したい内容を自然言語で入力してください（例: 「AIについての情報」「最新のプロジェクト情報」）"
      ),
  }),
  outputSchema: z.object({
    text: z.string().describe("要約された回答"),
  }),
})
  .then(
    createStep({
      id: "generate-cql-query",
      inputSchema: z.object({
        query: z.string(),
      }),
      outputSchema: z.object({
        cql: z.string(),
      }),
      execute: async ({ inputData }) => {
        const prompt = `
      以下の自然言語の検索要求をConfluence CQL（Confluence Query Language）に変換してください。
      CQLの基本的な構文:
      - text ~ "検索語" : 全文検索
      - title ~ "タイトル" : タイトル検索
      - space = "スペースキー" : 特定のスペース内検索
      - type = page : ページのみ検索
      - created >= "2024-01-01" : 日付フィルタ

      検索要求: ${inputData.query}

      重要:
      - 単純な単語検索の場合は、text ~ "単語" の形式を使用
      - 複数の単語を含む場合は AND で結合
      - 日本語の検索語もそのまま使用可能
      - レスポンスはCQLクエリのみを返してください

      CQLクエリ:`;

        try {
          const result = await assistantAgent.generateVNext(prompt);
          const cql = result.text.trim();

          return {
            cql,
          };
        } catch (error) {
          const feedbackCql = `text ~ "${inputData.query}"`;

          return {
            cql: feedbackCql,
          };
        }
      },
    })
  )
  .then(confluenceSearchPagesStep)
  .then(
    createStep({
      id: "select-first-step",
      inputSchema: z.object({
        pages: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z.string(),
          })
        ),
        total: z.number(),
        error: z.string().optional(),
      }),
      outputSchema: z.object({
        pageId: z.string(),
        expand: z.string(),
        error: z.string().optional(),
      }),
      execute: async ({ inputData }) => {
        // ページ一覧を取得する
        const { pages, error } = inputData;

        if (error) {
          // 例外で落とすと workflow 全体が中断されるため、下流へ error を伝搬させる
          return {
            pageId: "",
            expand: "body.storage",
            error: `検索エラー: ${error}`,
          };
        }

        if (!pages || pages.length === 0) {
          return {
            pageId: "",
            expand: "body.storage",
            error: "検索結果が見つかりませんでした",
          };
        }

        const firstPage = pages[0];

        return {
          pageId: firstPage.id,
          expand: "body.storage",
        };
      },
    })
  )
  .then(confluenceGetPageDetailStep)
  .then(
    createStep({
      id: "prepare-prompt",
      inputSchema: z.object({
        page: z.object({
          id: z.string(),
          title: z.string(),
          url: z.string(),
          content: z.string().optional(),
        }),
        error: z.string().optional(),
      }),
      outputSchema: z.object({
        prompt: z.string(),
        originalQuery: z.string(),
        pageTitle: z.string(),
        pageUrl: z.string(),
      }),
      execute: async ({ inputData, getInitData }) => {
        const { page, error } = inputData;

        const initData = getInitData();

        if (error || !page || !page.content) {
          return {
            prompt:
              `ページの内容が取得できませんでした。\n\n` +
              `原因: ${error ?? "不明"}\n\n` +
              `確認ポイント:\n` +
              `- CONFLUENCE_BASE_URL（例: https://your-domain.atlassian.net）\n` +
              `- CONFLUENCE_USER_EMAIL（Atlassianのメールアドレス）\n` +
              `- CONFLUENCE_API_KEY（ConfluenceのAPIトークン）\n`,
            originalQuery: initData.query || "",
            pageTitle: page.title || "",
            pageUrl: page.url || "",
          };
        }

        // エージェントへの指示を作成する
        const prompt = `以下のConfluenceのページの内容に基づいて、ユーザーの質問に答えてください。

        ユーザーの質問: ${initData.query}

        ページのタイトル: ${page.title}
        ページの内容: ${page.content}

        回答は簡潔で分かりやすく、必要に応じて箇条書きを使用してください。`;

        return {
          prompt,
          originalQuery: initData.query || "",
          pageTitle: page.title || "",
          pageUrl: page.url || "",
        };
      },
    })
  )
  .then(
    createStep({
      id: "assistant-response",
      inputSchema: z.object({
        prompt: z.string(),
        originalQuery: z.string(),
        pageTitle: z.string(),
        pageUrl: z.string(),
      }),
      outputSchema: z.object({
        text: z.string(),
      }),
      execute: async ({ inputData }) => {
        try {
          const result = await assistantAgent.generateVNext(inputData.prompt);
          return {
            text: result.text.trim(),
          };
        } catch (error) {
          return {
            text: "エラーが発生しました。" + String(error),
          };
        }
      },
    })
  )
  .commit();
