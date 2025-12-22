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

    let message;
    let isSuccess;

    if (result.status === "success" && result.result.success) {
      message = "ワークフローが正常に完了しました";
      isSuccess = true;
    } else {
      message = "ワークフローが正常に完了しました";
      isSuccess = false;
    }

    const workflowOutput = result.status === "success" ? result.result : null;
    const createdIssues = workflowOutput?.createdIssues ?? [];

    return NextResponse.json({
      success: isSuccess,
      confluencePages: [
        {
          title: query,
          message: "要件書の検索と取得を実行しました",
        },
      ],
      message,
      createdIssues,
      steps: result.steps
        ? Object.keys(result.steps).map((stepId) => ({
            stepId,
            status: result.steps[stepId]?.status,
          }))
        : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "ワークフローの実行中にエラーが発生しました。" + String(error) },
      { status: 500 }
    );
  }
}
