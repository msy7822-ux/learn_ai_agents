export interface WorkflowFormData {
  query: string;
  owner: string;
  repo: string;
}

export interface WorkflowFormResult {
  success: boolean;
  message: string;
  confluencePages: {
    title: string;
    message: string;
  }[];
  createdIssues: {
    issueNumber: number;
    issueUrl: string;
    title: string;
  }[];
  steps: {
    stepId: string;
    status: string;
  }[];

  error?: string;
}
