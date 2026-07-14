import { execFileAsync } from "./format";
import type { AnalysisResult } from "./types";
import { CONFIG } from "./config";
import fs from "node:fs";
import path from "node:path";
import type Docker from "dockerode";

function buildProcessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // MYTHIC itself runs with NODE_ENV=production. Passing that value into
  // Nixpacks makes package managers omit devDependencies before the app build,
  // which removes Tailwind/PostCSS/TypeScript and breaks most modern frontends.
  delete env.NODE_ENV;
  delete env.NPM_CONFIG_PRODUCTION;
  delete env.NPM_CONFIG_OMIT;

  // Keep build tooling available regardless of npm/yarn defaults inherited
  // from the MYTHIC runtime container.
  env.NPM_CONFIG_INCLUDE = "dev";
  env.YARN_PRODUCTION = "false";

  return env;
}

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
    // Frontend compilers and CSS processors normally live in devDependencies.
    // They are required while building even though the resulting app runs in
    // production mode afterwards.
    lines.push(`ENV NODE_ENV=development`);
    lines.push(`RUN npm ci --include=dev || npm install --include=dev`);
    lines.push(`COPY . .`);
    if (build) lines.push(`RUN ${build}`);
    lines.push(`ENV NODE_ENV=production`);
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
    env: buildProcessEnv(),
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
