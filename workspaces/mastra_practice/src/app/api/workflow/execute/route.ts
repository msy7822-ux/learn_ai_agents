import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, owner, repo } = body;

    if (!query || !owner || !repo) {
      return NextResponse.json(
        { error: "必要なパラメータが不足しています。" },
        { status: 400 }
      );
    }

    // Mastraのワークフローインスタンスを取得
    const mastra = await import("@/mastra");
    const workflow = mastra.mastra.getWorkflow("handsOnWorkflow");

    if (!workflow) {
      return NextResponse.json(
        { error: "ワークフローが見つかりません。" },
        { status: 404 }
      );
    }

    const run = await workflow.createRunAsync();
    const result = await run.start({
      inputData: {
        query,
        owner,
        repo,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "エラーが発生しました。" + String(error) },
      { status: 500 }
    );
  }
}
