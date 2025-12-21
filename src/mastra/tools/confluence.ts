// 必要なモジュールインポートする
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// 環境変数からAPIキーなどを取得する
const CONFLUENCE_API_KEY = process.env.CONFLUENCE_API_KEY || "";
const CONFLUENCE_BASE_URL = process.env.CONFLUENCE_BASE_URL || "";
const CONFLUENCE_USER_EMAIL = process.env.CONFLUENCE_USER_EMAIL || "";

function assertConfluenceConfig() {
  const missing: string[] = [];
  if (!CONFLUENCE_BASE_URL) missing.push("CONFLUENCE_BASE_URL");
  if (!CONFLUENCE_USER_EMAIL) missing.push("CONFLUENCE_USER_EMAIL");
  if (!CONFLUENCE_API_KEY) missing.push("CONFLUENCE_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Confluence設定が不足しています: ${missing.join(", ")}. ` +
        `env に必要な値を設定してください（例: CONFLUENCE_BASE_URL=https://your-domain.atlassian.net）`
    );
  }
}

function getAuthHeaders(): Record<string, string> {
  assertConfluenceConfig();
  const auth = Buffer.from(
    `${CONFLUENCE_USER_EMAIL}:${CONFLUENCE_API_KEY}`
  ).toString("base64");

  return {
    Authorization: `Basic ${auth}`,
    accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function callConfluenceAPI(endpoint: string, options?: RequestInit) {
  assertConfluenceConfig();
  const url = `${CONFLUENCE_BASE_URL}/wiki/rest/api${endpoint}`;

  // fetch関数でコールする
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const status = response.status;
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }

    if (status === 401) {
      throw new Error(
        `HTTP error! status: 401 (Unauthorized). ` +
          `Confluence認証に失敗しました。` +
          `CONFLUENCE_USER_EMAIL / CONFLUENCE_API_KEY（APIトークン）/ CONFLUENCE_BASE_URL を確認してください。`
      );
    }

    throw new Error(
      `HTTP error! status: ${status}${response.statusText ? ` ${response.statusText}` : ""}` +
        (bodyText ? ` - ${bodyText}` : "")
    );
  }

  return response.json();
}

/**
 * Confluenceのページ一覧を検索するツール
 */
export const confluenceSearchPagesTool = createTool({
  id: "confluence-search-page",
  description: "Confluenceのページを検索する",
  inputSchema: z.object({
    cql: z.string().describe("Confluence Query Languageで検索するクエリ"),
  }),
  outputSchema: z.object({
    pages: z.array(
      z.object({
        id: z.string().describe("ページのID"),
        title: z.string().describe("ページのタイトル"),
        url: z.string().describe("ページのURL"),
      })
    ),
    total: z.number().describe("検索結果の総数"),
    error: z.string().describe("エラーメッセージ").optional(),
  }),
  execute: async ({ context }) => {
    const params = new URLSearchParams();
    params.append("cql", context.cql);

    try {
      // APIコールする
      const data = await callConfluenceAPI(`/search?${params.toString()}`);

      // 検索結果から一覧を作成する
      const pages = data.results.map((result: any) => ({
        id: result.content?.id,
        title: result.content?.title,
        url: result.url
          ? `${CONFLUENCE_BASE_URL}/wiki/${result.url}`
          : undefined,
      }));

      return {
        pages,
        total: data.total,
      };
    } catch (error) {
      return {
        pages: [],
        total: 0,
        error: String(error),
      };
    }
  },
});

/**
 * Confluenceのページの詳細を取得するツール
 */
export const confluenceGetPageDetailTool = createTool({
  id: "confluence-get-page-detail",
  description: "Confluenceのページの詳細を取得する",
  inputSchema: z.object({
    pageId: z.string().describe("ページのID"),
    expand: z
      .string()
      .describe("追加で取得する情報(例：body.storage, version, space)"),
    // workflow で直前ステップの outputSchema と inputSchema の完全一致が要求されるため、
    // 上流から渡ってくる可能性がある値も受け取れるようにしておく（未使用）。
    error: z
      .string()
      .optional()
      .describe("上流で発生したエラーメッセージ（任意）"),
  }),
  outputSchema: z.object({
    page: z.object({
      id: z.string().describe("ページのID"),
      title: z.string().describe("ページのタイトル"),
      url: z.string().describe("ページのURL"),
      content: z.string().describe("ページのコンテンツ（HTML形式）").optional(),
    }),
    error: z.string().describe("エラーメッセージ").optional(),
  }),
  execute: async ({ context }) => {
    if (context.error) {
      return {
        page: {
          id: "",
          title: "",
          url: "",
          content: undefined,
        },
        error: context.error,
      };
    }
    const params = new URLSearchParams();
    if (context.expand) {
      params.append("expand", context.expand);
    }

    try {
      // APIコールする
      const endpoint = `/content/${context.pageId}?${params.toString() ?? ""}`;
      const data = await callConfluenceAPI(endpoint);

      // ページの詳細を作成する
      const page = {
        id: data.id,
        title: data.title,
        url: data.url,
        content: data.content,
      };

      return {
        page,
      };
    } catch (error) {
      return {
        page: {
          id: "",
          title: "",
          url: "",
          content: undefined,
        },
        error: String(error),
      };
    }
  },
});
