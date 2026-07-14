export type DeploymentPhase =
  | "queued"
  | "cloning"
  | "analyzing"
  | "building"
  | "deploying"
  | "running"
  | "failed"
  | "stopped";

export type DeploymentMode = "live" | "simulation";

export interface AnalysisResult {
  provider: string;
  language?: string;
  framework?: string;
  baseImage?: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
  environment: Record<string, string>;
  dockerfile?: string;
  notes?: string;
}

export interface DeploymentRecord {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  domain: string;
  port: number;
  env: Record<string, string>;
  imageName: string;
  containerId?: string;
  status: DeploymentPhase;
  mode: DeploymentMode;
  analysis: AnalysisResult | null;
  logs: string;
  createdAt: number;
  updatedAt: number;
  url: string;
}

export interface CreateDeploymentInput {
  repoUrl: string;
  branch?: string;
  name?: string;
  domain?: string;
  port?: number;
  env?: Record<string, string>;
  buildCommand?: string;
  startCommand?: string;
}

// --- Multideploy: several of the user's own repos, deployed together as one stack ---

export type StackPhase = "queued" | "running" | "complete" | "failed";
export type StackMemberStatus = "pending" | "deploying" | "done" | "failed" | "skipped";

export interface StackMemberInput {
  /** Short local id used inside ${key.url} / ${key.domain} placeholders in other members' env. */
  key: string;
  repoUrl: string;
  branch?: string;
  name?: string;
  domain?: string;
  port?: number;
  /** May reference other members: "${bellows.url}/v1" resolves once "bellows" finishes deploying. */
  env?: Record<string, string>;
}

export interface CreateStackInput {
  name: string;
  members: StackMemberInput[];
}

export interface StackMemberRecord {
  key: string;
  repoUrl: string;
  branch: string;
  order: number;
  status: StackMemberStatus;
  deploymentId: string | null;
  error: string | null;
}

export interface StackRecord {
  id: string;
  name: string;
  status: StackPhase;
  members: StackMemberRecord[];
  createdAt: number;
  updatedAt: number;
}
