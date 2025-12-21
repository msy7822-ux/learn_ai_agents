import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const GITHUB_PA_TOKEN = process.env.GITHUB_PA_TOKEN || "";

export const githubCreateIssueTool = createTool({
  id: "github-create-issue",
  description:
    "GitHub上でIssueを作成します。バグ報告、機能要求、質問などに使用できます。",
  inputSchema: z.object({
    owner: z
      .string()
      .describe("リポジトリの所有者名（ユーザー名またはorganization名）"),
    repo: z.string().describe("リポジトリ名"),
    // Issueはタイトルと本文を持ったオブジェクトの配列である
    issues: z
      .array(
        z.object({
          title: z.string().describe("Issueのタイトル"),
          body: z.string().describe("Issueの内容"),
        })
      )
      .describe("作成するIssueのリスト"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Issueの作成が成功したかどうか"),
    createdIssues: z
      .array(
        z.object({
          issueNumber: z.number().describe("Issueの番号").optional(),
          issueUrl: z.string().describe("IssueのURL").optional(),
          title: z.string().describe("Issueのタイトル").optional(),
        })
      )
      .describe("作成されたIssueのリスト"),
    errors: z.array(z.string()).describe("エラーメッセージのリスト").optional(),
  }),
  execute: async ({ context }) => {
    const { owner, repo, issues } = context;
    const createdIssues: Array<{
      issueNumber?: number;
      issueUrl?: string;
      title?: string;
    }> = [];

    const errors: string[] = [];

    for (const issue of issues) {
      try {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/issues`,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              Authorization: `Bearer ${GITHUB_PA_TOKEN}`,
              "X-GitHub-Api-Version": "2022-11-28",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: issue.title,
              body: issue.body,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.message || "不明なエラー";
          errors.push(`GitHub APIエラー: ${issue.title} - ${errorMessage}`);
          continue;
        }

        const issueData = await response.json();
        createdIssues.push({
          issueNumber: issueData.number,
          issueUrl: issueData.html_url,
          title: issueData.title,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "不明なエラー";
        errors.push(`GitHub APIエラー: ${issue.title} - ${errorMessage}`);
      }
    }

    return {
      success: createdIssues.length > 0,
      createdIssues,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
