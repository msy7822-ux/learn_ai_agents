import { Mastra } from "@mastra/core/mastra";
import { assistantAgent } from "./agents/index";
import { handsOnWorkflow } from "./workflows/handson";

export const mastra = new Mastra({
  workflows: { handsOnWorkflow },
  agents: { assistantAgent },
});
