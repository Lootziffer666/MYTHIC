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
