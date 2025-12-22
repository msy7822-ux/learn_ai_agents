import { createWorkflow, createStep } from "@mastra/core/workflows";
import { confluenceSearchPagesTool } from "../tools/confluence";
import { confluenceGetPageDetailTool } from "../tools/confluence";
import { githubCreateIssueTool } from "../tools/github";
import { assistantAgent } from "../agents";
import { z } from "zod";

/**
 * ツールからステップを作成
 * Mastraの強みとして、ツールをそのままワークフローの1ステップにすることができる
 */
const confluenceSearchPagesStep = createStep(confluenceSearchPagesTool);
const confluenceGetPageDetailStep = createStep(confluenceGetPageDetailTool);
const githubCreateIssueStep = createStep(githubCreateIssueTool);

export const handsOnWorkflow = createWorkflow({
  id: "hands-on",
  description:
    "自然言語の質問からConfluenceで要件定義書を検索し、GitHub Issueとして開発バックログを自動作成します。",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "検索したい内容を自然言語で入力してください（例: 「AIについての情報」「最新のプロジェクト情報」）"
      ),
    owner: z
      .string()
      .describe(
        "GitHubのリポジトリの所有者名（ユーザー名またはorganization名）"
      ),
    repo: z.string().describe("GitHubのリポジトリ名"),
  }),
  outputSchema: githubCreateIssueTool.outputSchema,
})
  .then(
    createStep({
      id: "generate-cql-query",
      inputSchema: z.object({
        query: z.string(),
        owner: z.string(),
        repo: z.string(),
      }),
      outputSchema: z.object({
        cql: z.string(),
        fallbackCql: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async ({ inputData }) => {
        const baseFallbackCql = `type = page AND (text ~ "${inputData.query}" OR title ~ "${inputData.query}")`;
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
      - 可能な限り type = page を含める
      - text と title のどちらもヒットさせたい場合は (text ~ "..." OR title ~ "...") を使う
      - 日本語の検索語もそのまま使用可能
      - レスポンスはCQLクエリのみを返してください

      CQLクエリ:`;

        try {
          const result = await assistantAgent.generateVNext(prompt);
          const raw = result.text.trim();
          const cleaned = raw
            .replace(/^```[\s\S]*?\n/, "") // 先頭コードフェンスっぽいものを除去（保険）
            .replace(/```$/m, "")
            .replace(/^CQLクエリ\s*:\s*/i, "")
            .trim();
          const cql = cleaned.length > 0 ? cleaned.split("\n")[0].trim() : "";

          return {
            cql: cql || baseFallbackCql,
            fallbackCql: baseFallbackCql,
            limit: 10,
          };
        } catch (error) {
          return {
            cql: baseFallbackCql,
            fallbackCql: baseFallbackCql,
            limit: 10,
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
        debug: z
          .object({
            triedCqls: z.array(z.string()),
            endpoint: z.string(),
          })
          .optional(),
      }),
      outputSchema: z.object({
        pageId: z.string(),
        expand: z.string(),
        error: z.string().optional(),
      }),
      execute: async ({ inputData }) => {
        // ページ一覧を取得する
        const { pages, error, debug } = inputData;

        if (error) {
          // 例外で落とすと workflow 全体が中断されるため、下流へ error を伝搬させる
          return {
            pageId: "",
            expand: "body.storage",
            error: `検索エラー: ${error}`,
          };
        }

        if (!pages || pages.length === 0) {
          const tried =
            debug?.triedCqls && debug.triedCqls.length > 0
              ? `（試行CQL: ${debug.triedCqls.join(" | ")}）`
              : "";
          return {
            pageId: "",
            expand: "body.storage",
            error: `検索結果が見つかりませんでした${tried}`,
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
      id: "create-github-issues",
      inputSchema: confluenceGetPageDetailTool.outputSchema,
      // このステップは「GitHub Issue作成ツールに渡す入力」を生成する
      outputSchema: githubCreateIssueTool.inputSchema,
      execute: async ({ inputData, getInitData }) => {
        const { page, error } = inputData;
        const { owner, repo, query } = getInitData();

        if (error || !page || !page.content) {
          return {
            owner: owner || "",
            repo: repo || "",
            issues: [
              {
                title: "エラー: ページの内容が取得できませんでした。",
                body:
                  "Confluenceページの内容を取得できませんでした。\n\n" +
                  `原因: ${error ?? "不明"}`,
              },
            ],
          };
        }

        const outputSchema = z.object({
          issues: z.array(
            z.object({
              title: z.string(),
              body: z.string(),
            })
          ),
        });

        // プロンプト
        const prompt = `以下のConfluenceページの内容は要件書です。
        この要件書を分析して、開発バックログのGitHub Issueを複数作成するための情報を生成してください。

        ユーザーの質問: ${query}
        ページのタイトル: ${page.title}

        重要:
        - 要件書の内容を機能やコンポーネント単位で分割
        - 各Issueのtitleは簡潔で分かりやすく（誰が見てもわかるように）
        - bodyはMarkdown形式で構造化する
        - フォーマットは **JSONオブジェクト** で必ず次の形にする（枕詞は不要）: {"issues":[{"title":"...","body":"..."}]}
        - \`\`\`jsonのようなコードブロックは不要
        - 2つのIssueを作成
        - 曖昧な部分は「要確認」として記載する`;

        const safeJsonParse = (text: string): any => {
          const trimmed = text.trim();
          try {
            return JSON.parse(trimmed);
          } catch {
            // LLMが余計な文言を混ぜた場合に備えて、JSONっぽい部分を抽出して再トライ
            const firstObj = trimmed.indexOf("{");
            const lastObj = trimmed.lastIndexOf("}");
            if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
              const slice = trimmed.slice(firstObj, lastObj + 1);
              try {
                return JSON.parse(slice);
              } catch {
                // noop
              }
            }
            const firstArr = trimmed.indexOf("[");
            const lastArr = trimmed.lastIndexOf("]");
            if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
              const slice = trimmed.slice(firstArr, lastArr + 1);
              return JSON.parse(slice);
            }
            throw new Error("LLMの出力がJSONとして解析できませんでした。");
          }
        };

        try {
          const result = await assistantAgent.generateVNext(prompt);
          const parsedResult = safeJsonParse(result.text);
          // { issues: [...] } でも [...] でも受け取れるようにする
          const rawIssues = Array.isArray(parsedResult)
            ? parsedResult
            : parsedResult?.issues;

          if (!Array.isArray(rawIssues)) {
            throw new Error(
              `LLMの出力JSONに issues 配列が見つかりませんでした。出力: ${result.text}`
            );
          }

          const issues = rawIssues
            .filter((issue: any) => issue && typeof issue === "object")
            .map((issue: any) => ({
              title: String(issue.title ?? "").trim(),
              body: String(issue.body ?? "").trim(),
            }))
            .filter(
              (issue: any) => issue.title.length > 0 && issue.body.length > 0
            );

          return {
            owner: owner || "",
            repo: repo || "",
            issues,
          };
        } catch (error) {
          return {
            owner: owner || "",
            repo: repo || "",
            issues: [
              {
                title: "エラー: 要件書の分析に失敗しました。",
                body: "要件書の分析に失敗しました。" + String(error),
              },
            ],
          };
        }
      },
    })
  )
  .then(githubCreateIssueStep)
  // .then(
  //   createStep({
  //     id: "prepare-prompt",
  //     inputSchema: z.object({
  //       page: z.object({
  //         id: z.string(),
  //         title: z.string(),
  //         url: z.string(),
  //         content: z.string().optional(),
  //       }),
  //       error: z.string().optional(),
  //     }),
  //     outputSchema: z.object({
  //       prompt: z.string(),
  //       originalQuery: z.string(),
  //       pageTitle: z.string(),
  //       pageUrl: z.string(),
  //     }),
  //     execute: async ({ inputData, getInitData }) => {
  //       const { page, error } = inputData;

  //       const initData = getInitData();

  //       if (error || !page || !page.content) {
  //         return {
  //           prompt:
  //             `ページの内容が取得できませんでした。\n\n` +
  //             `原因: ${error ?? "不明"}\n\n` +
  //             `確認ポイント:\n` +
  //             `- CONFLUENCE_BASE_URL（例: https://your-domain.atlassian.net）\n` +
  //             `- CONFLUENCE_USER_EMAIL（Atlassianのメールアドレス）\n` +
  //             `- CONFLUENCE_API_KEY（ConfluenceのAPIトークン）\n`,
  //           originalQuery: initData.query || "",
  //           pageTitle: page.title || "",
  //           pageUrl: page.url || "",
  //         };
  //       }

  //       // エージェントへの指示を作成する
  //       const prompt = `以下のConfluenceのページの内容に基づいて、ユーザーの質問に答えてください。

  //       ユーザーの質問: ${initData.query}

  //       ページのタイトル: ${page.title}
  //       ページの内容: ${page.content}

  //       回答は簡潔で分かりやすく、必要に応じて箇条書きを使用してください。`;

  //       return {
  //         prompt,
  //         originalQuery: initData.query || "",
  //         pageTitle: page.title || "",
  //         pageUrl: page.url || "",
  //       };
  //     },
  //   })
  // )
  // .then(
  //   createStep({
  //     id: "assistant-response",
  //     inputSchema: z.object({
  //       prompt: z.string(),
  //       originalQuery: z.string(),
  //       pageTitle: z.string(),
  //       pageUrl: z.string(),
  //     }),
  //     outputSchema: z.object({
  //       text: z.string(),
  //     }),
  //     execute: async ({ inputData }) => {
  //       try {
  //         const result = await assistantAgent.generateVNext(inputData.prompt);
  //         return {
  //           text: result.text.trim(),
  //         };
  //       } catch (error) {
  //         return {
  //           text: "エラーが発生しました。" + String(error),
  //         };
  //       }
  //     },
  //   })
  // )
  .commit();
