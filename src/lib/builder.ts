import { execFileAsync } from "./format";
import type { AnalysisResult } from "./types";
import { CONFIG } from "./config";
import fs from "node:fs";
import path from "node:path";
import type Docker from "dockerode";

export function generateDockerfile(analysis: AnalysisResult): string {
  const base = analysis.baseImage || "node:20-slim";
  const build = analysis.buildCommand;
  const start = analysis.startCommand || "npm start";
  const port = analysis.port || CONFIG.defaultPort;

  const envLines = Object.entries(analysis.environment || {})
    .map(([k, v]) => `ENV ${k}=${v}`)
    .join("\n");

  if (analysis.language === "Static") {
    return [
      `FROM ${base}`,
      `WORKDIR /usr/share/nginx/html`,
      `COPY . .`,
      `EXPOSE 80`,
      `CMD ["nginx", "-g", "daemon off;"]`,
    ].join("\n");
  }

  const isNode = analysis.language === "Node.js";
  const lines = [
    `# MYTHIC generated Dockerfile`,
    `FROM ${base}`,
    `WORKDIR /app`,
    envLines,
  ];

  if (isNode) {
    lines.push(`COPY package*.json ./`);
    lines.push(`RUN npm install --omit=dev || npm install`);
    lines.push(`COPY . .`);
    if (build) lines.push(`RUN ${build}`);
    lines.push(`EXPOSE ${port}`);
    lines.push(`CMD ${start}`);
  } else {
    lines.push(`COPY . .`);
    if (build) lines.push(`RUN ${build}`);
    lines.push(`EXPOSE ${port}`);
    lines.push(`CMD ${start}`);
  }
  return lines.join("\n");
}

export async function buildWithNixpacks(
  repoDir: string,
  imageName: string,
  onLog?: (line: string) => void
): Promise<string> {
  const args = ["build", repoDir, "--name", imageName];
  onLog?.(`$ nixpacks ${args.join(" ")}`);
  const { stdout, stderr } = await execFileAsync(CONFIG.nixpacksBin, args, {
    timeout: 1000 * 60 * 15,
    maxBuffer: 1024 * 1024 * 30,
  });
  if (stdout.trim()) onLog?.(stdout);
  if (stderr.trim()) onLog?.(stderr);
  return imageName;
}

export async function buildWithDockerfile(
  repoDir: string,
  imageName: string,
  analysis: AnalysisResult,
  docker: Docker,
  onLog?: (line: string) => void
): Promise<string> {
  const dockerfile = analysis.dockerfile?.trim() || generateDockerfile(analysis);
  fs.writeFileSync(path.join(repoDir, "Dockerfile.mythic"), dockerfile);
  onLog?.(`${analysis.dockerfile ? "Using AI-supplied" : "Generated"} Dockerfile:\n${dockerfile}`);

  await new Promise<void>((resolve, reject) => {
    docker.buildImage(
      {
        context: repoDir,
        src: [...fs.readdirSync(repoDir), "Dockerfile.mythic"],
      },
      { t: imageName, dockerfile: "Dockerfile.mythic", pull: true },
      (err: Error | null, stream?: NodeJS.ReadableStream) => {
        if (err || !stream) return reject(err ?? new Error("No build stream"));
        docker.modem.followProgress(
          stream,
          (doneErr: Error | null) => (doneErr ? reject(doneErr) : resolve()),
          (event: { stream?: string }) => {
            if (event.stream) onLog?.(event.stream.trimEnd());
          }
        );
      }
    );
  });
  return imageName;
}
