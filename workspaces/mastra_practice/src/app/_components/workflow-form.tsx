"use client";

import { WorkflowFormData } from "../_types/workflow";
interface WorkflowInstructionsProps {
  formData: WorkflowFormData;
  isLoading: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export const WorkflowForm = ({
  // formData,
  // isLoading,
  // onInputChange,
  onSubmit,
}: WorkflowInstructionsProps) => {
  // const isFormValid = formData.query.trim().length > 0 && formData.owner.trim().length > 0 && formData.repo.trim().length > 0;
  return (
    <form onSubmit={onSubmit} className="w-full max-w-2xl">
      <div className="mb-6">
        <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
          <span className="text-red-500">*</span>
          <span className="text-gray-700 font-medium">質問内容</span>
        </label>
      </div>
    </form>
  )
}
