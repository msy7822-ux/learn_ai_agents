export const WorkflowInstructions = () => {
  return (
    <div className="bg-linear-to-br from-blue-500 to-purple-500 p-6 rounded-lg shadow-lg text-white">
      <h2 className="text-2xl font-bold mb-4">ワークフローの流れ</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-start space-x-3">
          <span className="shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
          <p className="text-gray-700 font-medium">Confluenceの要件定義を検索</p>
        </div>

        <div className="flex items-start space-x-3">
          <span className="shrink-0 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
          <p className="text-gray-700 font-medium">要件定義を分析</p>
        </div>

        <div className="flex items-start space-x-3">
          <span className="shrink-0 w-8 h-8 bg-violet-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
          <p className="text-gray-700 font-medium">バックログに分析</p>
        </div>

        <div className="flex items-start space-x-3">
          <span className="shrink-0 w-8 h-8 bg-fuchsia-600 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
          <p className="text-gray-700 font-medium">GitHub Issueを作成</p>
        </div>
      </div>
    </div>
  )
}
