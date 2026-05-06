// Shared tool interface and execution context types.
import { z } from "zod";
import { SessionState } from "@/lib/types/domain";

export interface ToolContext {
  sessionId: string;
  state: SessionState;
}

export interface ToolDefinition<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<z.infer<TOutput>>;
}

export type AnyTool = ToolDefinition<z.ZodTypeAny, z.ZodTypeAny>;
