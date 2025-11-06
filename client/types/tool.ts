/**
 * Tool-related types for the client application
 */


export interface ToolEventDetailSection {
  title?: string;
  lines: string[];
  footnote?: string;
}


export interface ToolEvent {
  id: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  rawInput?: unknown;
  rawOutput?: unknown;
  headline?: string;
  detail?: string;
  links?: Array<{ title: string; url: string }>;
  detailSections?: ToolEventDetailSection[];
}