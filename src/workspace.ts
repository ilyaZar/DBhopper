import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ClaimFile, ClaimFileRole, DBhopperClaim, DBhopperConfig, PreparedClaim } from "./types.js";

export interface FileInput {
  role: ClaimFileRole;
  sourcePath?: string;
  assetName?: string;
  targetName?: string;
  description?: string;
}

export interface PrepareClaimParams {
  confirm?: boolean;
  claimId?: string;
  claim?: DBhopperClaim;
  profileAssetName?: string;
  files?: FileInput[];
  overwrite?: boolean;
}

export interface WorkspacePaths {
  root: string;
  claimsDir: string;
  assetsDir: string;
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLAIM_ID_MAX = 80;

export function resolveWorkspace(config: DBhopperConfig = {}): WorkspacePaths {
  const root = path.resolve(config.workspaceRoot || PACKAGE_ROOT);
  return {
    root,
    claimsDir: path.join(root, "claims"),
    assetsDir: path.join(root, "assets"),
  };
}

export async function ensureWorkspace(config: DBhopperConfig = {}): Promise<WorkspacePaths> {
  const workspace = resolveWorkspace(config);
  await fs.mkdir(workspace.claimsDir, { recursive: true });
  await fs.mkdir(workspace.assetsDir, { recursive: true });
  return workspace;
}

export function normalizeClaimId(value?: string): string {
  const raw = value?.trim() || `claim-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, CLAIM_ID_MAX);
  if (!normalized) {
    throw new Error("claimId must contain at least one safe character");
  }
  return normalized;
}

export function claimPaths(claimId: string, config: DBhopperConfig = {}) {
  const workspace = resolveWorkspace(config);
  const safeId = normalizeClaimId(claimId);
  const claimDir = path.join(workspace.claimsDir, safeId);
  return {
    workspace,
    claimId: safeId,
    claimDir,
    claimPath: path.join(claimDir, "claim.json"),
  };
}

export async function readClaim(claimId: string, config: DBhopperConfig = {}): Promise<PreparedClaim> {
  const paths = claimPaths(claimId, config);
  const raw = await fs.readFile(paths.claimPath, "utf8");
  const claim = JSON.parse(raw) as DBhopperClaim;
  return {
    claimId: paths.claimId,
    claimDir: paths.claimDir,
    claimPath: paths.claimPath,
    claim,
    copiedFiles: claim.files || [],
  };
}

export async function listClaims(config: DBhopperConfig = {}) {
  const workspace = await ensureWorkspace(config);
  const entries = await fs.readdir(workspace.claimsDir, { withFileTypes: true });
  const claims = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const claimPath = path.join(workspace.claimsDir, entry.name, "claim.json");
    try {
      const raw = await fs.readFile(claimPath, "utf8");
      const claim = JSON.parse(raw) as DBhopperClaim;
      claims.push({
        claimId: entry.name,
        status: claim.status || "draft",
        journey: claim.journey,
        claimant: redactClaimant(claim.claimant),
        fileCount: claim.files?.length || 0,
      });
    } catch {
      claims.push({
        claimId: entry.name,
        status: "unreadable",
        fileCount: 0,
      });
    }
  }

  return claims.sort((a, b) => a.claimId.localeCompare(b.claimId));
}

export async function prepareClaim(
  params: PrepareClaimParams,
  config: DBhopperConfig = {},
): Promise<PreparedClaim> {
  if (params.confirm !== true) {
    throw new Error("confirm must be true before writing a claim workspace");
  }

  const workspace = await ensureWorkspace(config);
  const privateProfile = params.profileAssetName
    ? await readPrivateProfile(params.profileAssetName, workspace)
    : {};
  const incoming = mergeClaim(privateProfile, params.claim || {});
  const claimId = normalizeClaimId(params.claimId || incoming.claimId);
  const claimDir = path.join(workspace.claimsDir, claimId);
  const claimPath = path.join(claimDir, "claim.json");
  await fs.mkdir(claimDir, { recursive: true });

  if (!params.overwrite) {
    try {
      await fs.access(claimPath);
      throw new Error(`claim already exists: ${claimId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const copiedFiles = [];
  for (const file of params.files || []) {
    copiedFiles.push(await copyClaimFile(file, { claimDir, workspace }));
  }

  const existingFiles = Array.isArray(incoming.files) ? incoming.files : [];
  const claim: DBhopperClaim = {
    ...incoming,
    version: 1,
    claimId,
    status: incoming.status || "draft",
    files: [...existingFiles, ...copiedFiles],
  };

  await fs.writeFile(`${claimPath}.tmp`, `${JSON.stringify(claim, null, 2)}\n`, "utf8");
  await fs.rename(`${claimPath}.tmp`, claimPath);

  return {
    claimId,
    claimDir,
    claimPath,
    claim,
    copiedFiles,
  };
}

export async function recordClaimArtifact(
  claimId: string,
  file: ClaimFile,
  config: DBhopperConfig = {},
) {
  const prepared = await readClaim(claimId, config);
  const claim: DBhopperClaim = {
    ...prepared.claim,
    files: [...(prepared.claim.files || []), file],
  };
  await fs.writeFile(prepared.claimPath, `${JSON.stringify(claim, null, 2)}\n`, "utf8");
  return claim;
}

async function copyClaimFile(
  file: FileInput,
  paths: { claimDir: string; workspace: WorkspacePaths },
): Promise<ClaimFile> {
  if (!file.role) {
    throw new Error("file role is required");
  }
  if (!file.sourcePath && !file.assetName) {
    throw new Error("file sourcePath or assetName is required");
  }

  const source = file.assetName
    ? path.resolve(paths.workspace.assetsDir, file.assetName)
    : path.resolve(file.sourcePath || "");
  const sourceStat = await fs.stat(source);
  if (!sourceStat.isFile()) {
    throw new Error(`claim file source is not a file: ${source}`);
  }

  const targetName = safeFileName(file.targetName || path.basename(source));
  const target = path.join(paths.claimDir, targetName);
  await assertInside(paths.claimDir, target);
  await fs.copyFile(source, target);

  return {
    role: file.role,
    path: path.relative(paths.claimDir, target),
    reusableAsset: Boolean(file.assetName),
    ...(file.description ? { description: file.description } : {}),
  };
}

export async function resolveClaimFilePath(claimDir: string, value: string) {
  const resolved = path.resolve(claimDir, value);
  await assertInside(claimDir, resolved);
  return resolved;
}

function safeFileName(value: string) {
  const normalized = value.replace(/[^\w.,@() -]+/g, "_").replace(/\s+/g, " ").trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("targetName must be a safe file name");
  }
  return normalized;
}

async function readPrivateProfile(profileAssetName: string, workspace: WorkspacePaths) {
  const source = path.resolve(workspace.assetsDir, "private", profileAssetName);
  await assertInside(path.join(workspace.assetsDir, "private"), source);
  const raw = await fs.readFile(source, "utf8");
  const profile = JSON.parse(raw) as DBhopperClaim;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("private profile asset must contain a JSON object");
  }
  return profile;
}

function mergeClaim(base: DBhopperClaim, override: DBhopperClaim): DBhopperClaim {
  return mergeObjects(base, override) as DBhopperClaim;
}

function mergeObjects(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeObjects(merged[key], value);
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function assertInside(root: string, target: string) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path must stay inside the claim directory");
  }
}

function redactClaimant(claimant: DBhopperClaim["claimant"]) {
  if (!claimant) {
    return undefined;
  }
  return {
    salutation: claimant.salutation,
    firstName: claimant.firstName ? "[redacted]" : undefined,
    lastName: claimant.lastName ? "[redacted]" : undefined,
    email: claimant.email ? redactEmail(claimant.email) : undefined,
  };
}

export function redactEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!domain) {
    return "[redacted-email]";
  }
  return `${local.slice(0, 2)}***@${domain}`;
}
