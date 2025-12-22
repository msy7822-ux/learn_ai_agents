// 必要なモジュールインポートする
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type ConfluenceLinks = {
  webui?: string;
};

type ConfluenceContentSearchResult = {
  id?: string | number;
  title?: string;
  _links?: ConfluenceLinks;
};

type ConfluenceContentSearchResponse = {
  results?: ConfluenceContentSearchResult[];
  total?: number;
};

type ConfluencePageDetailResponse = {
  id?: string | number;
  title?: string;
  _links?: ConfluenceLinks;
  body?: {
    storage?: { value?: string };
    view?: { value?: string };
    editor?: { value?: string };
  };
};

// 環境変数からAPIキーなどを取得する
// 互換性のため CONFLUENCE_API_TOKEN / CONFLUENCE_API_KEY の両方を許可する
const CONFLUENCE_API_KEY =
  process.env.CONFLUENCE_API_TOKEN || process.env.CONFLUENCE_API_KEY || "";
const CONFLUENCE_BASE_URL_RAW = process.env.CONFLUENCE_BASE_URL || "";
const CONFLUENCE_USER_EMAIL = process.env.CONFLUENCE_USER_EMAIL || "";

function normalizeConfluenceBaseUrl(raw: string) {
  // 例: https://xxx.atlassian.net/wiki を渡しても動くように正規化する
  return raw.replace(/\/+$/, "").replace(/\/wiki$/, "");
}

const CONFLUENCE_BASE_URL = normalizeConfluenceBaseUrl(CONFLUENCE_BASE_URL_RAW);

function assertConfluenceConfig() {
  const missing: string[] = [];
  if (!CONFLUENCE_BASE_URL) missing.push("CONFLUENCE_BASE_URL");
  if (!CONFLUENCE_USER_EMAIL) missing.push("CONFLUENCE_USER_EMAIL");
  if (!CONFLUENCE_API_KEY)
    missing.push("CONFLUENCE_API_TOKEN / CONFLUENCE_API_KEY");

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
          `CONFLUENCE_USER_EMAIL / CONFLUENCE_API_TOKEN または CONFLUENCE_API_KEY（APIトークン）/ CONFLUENCE_BASE_URL を確認してください。`
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
    fallbackCql: z
      .string()
      .optional()
      .describe("検索0件だった場合に試すフォールバックCQL（任意）"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("取得件数（1〜50、任意）"),
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
    debug: z
      .object({
        triedCqls: z.array(z.string()),
        endpoint: z.string(),
      })
      .optional()
      .describe("デバッグ情報（任意）"),
  }),
  execute: async ({ context }) => {
    try {
      const triedCqls: string[] = [];
      const limit = context.limit ?? 10;

      const runSearch = async (cql: string) => {
        const params = new URLSearchParams();
        params.append("cql", cql);
        params.append("limit", String(limit));
        // Confluence Cloud の content search を使用（結果が扱いやすい）
        const endpoint = `/content/search?${params.toString()}`;
        const data = (await callConfluenceAPI(
          endpoint
        )) as ConfluenceContentSearchResponse;
        const pages = (data.results ?? []).map((result) => {
          const webui = result?._links?.webui;
          const url =
            typeof webui === "string" && webui.length > 0
              ? `${CONFLUENCE_BASE_URL}/wiki${webui}`
              : "";
          return {
            id: String(result?.id ?? ""),
            title: String(result?.title ?? ""),
            url,
          };
        });
        return { data, pages, endpoint };
      };

      triedCqls.push(context.cql);
      let { data, pages, endpoint } = await runSearch(context.cql);

      if (
        (data?.total ?? pages.length ?? 0) === 0 &&
        context.fallbackCql &&
        context.fallbackCql.trim().length > 0 &&
        context.fallbackCql.trim() !== context.cql.trim()
      ) {
        triedCqls.push(context.fallbackCql);
        const r = await runSearch(context.fallbackCql);
        data = r.data;
        pages = r.pages;
        endpoint = r.endpoint;
      }

      const total = Number(data?.total ?? pages.length ?? 0);

      if (!pages || pages.length === 0) {
        return {
          pages: [],
          total: 0,
          error:
            `検索結果が見つかりませんでした。` +
            `（試行CQL: ${triedCqls.join(" | ")}）` +
            `\nヒント: space = "SPACEKEY" でスペースを絞る / title ~ "..." を併用 / 権限・検索インデックスを確認`,
          debug: { triedCqls, endpoint },
        };
      }

      return {
        pages,
        total,
        debug: { triedCqls, endpoint },
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
      const data = (await callConfluenceAPI(
        endpoint
      )) as ConfluencePageDetailResponse;

      // ページの詳細を作成する
      const webui = data?._links?.webui;
      const url =
        typeof webui === "string" && webui.length > 0
          ? `${CONFLUENCE_BASE_URL}/wiki${webui}`
          : "";
      const content =
        data?.body?.storage?.value ??
        data?.body?.view?.value ??
        data?.body?.editor?.value ??
        undefined;
      const page = {
        id: String(data?.id ?? ""),
        title: String(data?.title ?? ""),
        url,
        content,
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
