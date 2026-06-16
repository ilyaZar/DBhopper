import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ClaimFile, ClaimFileRole, DBhopperClaim, DBhopperConfig, PreparedClaim } from "./types.js";
import {
  assertClaimTomlShape,
  mergeClaims,
  parseClaimToml,
  parsePrivateProfileToml,
  profileFieldsInClaim,
  schemaValidationMessages,
  stringifyClaimToml,
  stringifySubmittedRecipeToml,
} from "./claim-toml.js";
import {
  configuredClaimProfilesDir,
  listBuyingProfileIdFiles,
  listClaimProfileIdFiles,
  listPaymentProfileIdFiles,
  privateSettingsStatus,
  resolveSelectedClaimProfileFile,
} from "./private-settings.js";
import {
  parseBuyingProfileToml,
  schemaValidationMessagesForBuyingProfile,
} from "./buying-profile.js";
import {
  parsePaymentProfileToml,
  schemaValidationMessagesForPaymentProfile,
} from "./payment-profile.js";
import { validationErrorFromException } from "./validation-messages.js";

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
  files?: FileInput[];
  overwrite?: boolean;
}

export interface WorkspacePaths {
  root: string;
  claimsDir: string;
  assetsDir: string;
  profilesDir: string;
}

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLAIM_ID_MAX = 80;

export function resolveWorkspace(config: DBhopperConfig = {}): WorkspacePaths {
  const root = path.resolve(config.workspaceRoot || PACKAGE_ROOT);
  return {
    root,
    claimsDir: path.join(root, "claims"),
    assetsDir: path.join(root, "assets"),
    profilesDir: path.join(root, "assets", "private", "profiles"),
  };
}

export async function ensureWorkspace(config: DBhopperConfig = {}): Promise<WorkspacePaths> {
  const workspace = resolveWorkspace(config);
  await fs.mkdir(workspace.claimsDir, { recursive: true });
  await fs.mkdir(workspace.assetsDir, { recursive: true });
  await fs.mkdir(await configuredClaimProfilesDir(config), { recursive: true });
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
    claimPath: path.join(claimDir, "claim.toml"),
    recipePath: path.join(claimDir, "claim_submitted_recipe.toml"),
  };
}

export async function readClaim(claimId: string, config: DBhopperConfig = {}): Promise<PreparedClaim> {
  const paths = claimPaths(claimId, config);
  const raw = await fs.readFile(paths.claimPath, "utf8");
  const storedClaim = parseClaimToml(raw, paths.claimPath);
  const profileSelection = await resolveProfileSelection(config);
  const privateProfile = profileSelection
    ? await readPrivateProfile(profileSelection)
    : {};
  const claim = materializeClaim(
    privateProfile,
    storedClaim,
    paths.claimId,
  );
  return {
    claimId: paths.claimId,
    claimDir: paths.claimDir,
    claimPath: paths.claimPath,
    recipePath: paths.recipePath,
    profileId: profileSelection?.profileId,
    profileFile: profileSelection?.profileFile,
    storedClaim,
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
    const claimPath = path.join(workspace.claimsDir, entry.name, "claim.toml");
    if (!(await fileExists(claimPath))) {
      continue;
    }
    try {
      const raw = await fs.readFile(claimPath, "utf8");
      const storedClaim = parseClaimToml(raw, claimPath);
      const profileSelection = await resolveProfileSelection(config);
      const privateProfile = profileSelection
        ? await readPrivateProfile(profileSelection)
        : {};
      const claim = materializeClaim(
        privateProfile,
        storedClaim,
        entry.name,
      );
      claims.push({
        claimId: entry.name,
        status: claim.status || "draft",
        profileId: profileSelection?.profileId,
        profileFile: profileSelection?.profileFile,
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
  const incoming = params.claim || {};
  const privateFields = profileFieldsInClaim(incoming);
  if (privateFields.length > 0) {
    throw new Error(
      [
        `claim data must not include private fields: ${privateFields.join(", ")}`,
        "store claimant and bank data in the external path_clm profile directory",
      ].join("; "),
    );
  }

  const profileSelection = await resolveProfileSelection(config);
  const privateProfile = profileSelection
    ? await readPrivateProfile(profileSelection)
    : {};
  const claimId = normalizeClaimId(params.claimId || incoming.claimId);
  const claimDir = path.join(workspace.claimsDir, claimId);
  const claimPath = path.join(claimDir, "claim.toml");
  const recipePath = path.join(claimDir, "claim_submitted_recipe.toml");
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
  const storedClaim: DBhopperClaim = {
    ...incoming,
    claimId,
    status: incoming.status || "draft",
    files: [...existingFiles, ...copiedFiles],
  };
  assertClaimTomlShape(storedClaim, claimPath);
  const claim = materializeClaim(
    privateProfile,
    storedClaim,
    claimId,
  );

  await fs.writeFile(`${claimPath}.tmp`, stringifyClaimToml(storedClaim), "utf8");
  await fs.rename(`${claimPath}.tmp`, claimPath);

  return {
    claimId,
    claimDir,
    claimPath,
    recipePath,
    profileId: profileSelection?.profileId,
    profileFile: profileSelection?.profileFile,
    storedClaim,
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
  const storedClaim: DBhopperClaim = {
    ...(prepared.storedClaim || {}),
    files: [...(prepared.storedClaim?.files || []), file],
  };
  assertClaimTomlShape(storedClaim, prepared.claimPath);
  await fs.writeFile(prepared.claimPath, stringifyClaimToml(storedClaim), "utf8");
  const profileSelection = await resolveProfileSelection(config);
  return materializeClaim(
    profileSelection ? await readPrivateProfile(profileSelection) : {},
    storedClaim,
    prepared.claimId,
  );
}

export async function writeSubmittedRecipe(prepared: PreparedClaim) {
  if (!prepared.recipePath) {
    throw new Error("prepared claim is missing recipePath");
  }
  await fs.writeFile(
    `${prepared.recipePath}.tmp`,
    stringifySubmittedRecipeToml(prepared.claim),
    "utf8",
  );
  await fs.rename(`${prepared.recipePath}.tmp`, prepared.recipePath);
  return prepared.recipePath;
}

export async function validateWorkspaceTomlFiles(config: DBhopperConfig = {}) {
  const workspace = await ensureWorkspace(config);
  const messages = [];
  const settingsStatus = await privateSettingsStatus(config);
  if (settingsStatus.settings.exists) {
    messages.push(...settingsStatus.messages);
  }

  const routedProfiles = await listClaimProfileIdFiles(config);
  for (const profileFile of routedProfiles.items) {
    try {
      const parsed = parsePrivateProfileToml(
        await fs.readFile(profileFile.filePath, "utf8"),
        profileFile.filePath,
      );
      messages.push(
        ...schemaValidationMessages(parsed, "profile", profileFile.filePath),
      );
    } catch (error) {
      messages.push(validationErrorFromException("invalid_profile_toml", error));
    }
  }

  const routedBuyingProfiles = await listBuyingProfileIdFiles(config);
  for (const profileFile of routedBuyingProfiles.items) {
    try {
      const parsed = parseBuyingProfileToml(
        await fs.readFile(profileFile.filePath, "utf8"),
        profileFile.filePath,
      );
      messages.push(
        ...schemaValidationMessagesForBuyingProfile(parsed, profileFile.filePath),
      );
    } catch (error) {
      messages.push(
        validationErrorFromException("invalid_buying_profile_toml", error),
      );
    }
  }

  const routedPaymentProfiles = await listPaymentProfileIdFiles(config);
  for (const profileFile of routedPaymentProfiles.items) {
    try {
      const parsed = parsePaymentProfileToml(
        await fs.readFile(profileFile.filePath, "utf8"),
        profileFile.filePath,
      );
      messages.push(
        ...schemaValidationMessagesForPaymentProfile(parsed, profileFile.filePath),
      );
    } catch (error) {
      messages.push(
        validationErrorFromException("invalid_payment_profile_toml", error),
      );
    }
  }

  const claimDirs = await fs.readdir(workspace.claimsDir, { withFileTypes: true });
  for (const entry of claimDirs) {
    if (!entry.isDirectory()) {
      continue;
    }
    const claimPath = path.join(workspace.claimsDir, entry.name, "claim.toml");
    if (!(await fileExists(claimPath))) {
      continue;
    }
    try {
      const parsed = parseClaimToml(await fs.readFile(claimPath, "utf8"), claimPath);
      messages.push(...schemaValidationMessages(parsed, "claim", claimPath));
      const profileSelection = await resolveProfileSelection(config);
      if (profileSelection) {
        await readPrivateProfile(profileSelection);
      }
    } catch (error) {
      messages.push(validationErrorFromException("invalid_claim_toml", error));
    }
  }

  return {
    ok: messages.every((message) => message.severity !== "error"),
    messages,
  };
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

interface ProfileSelection {
  profileFile: string;
  profileId?: string;
  profilePath: string;
  profileDir: string;
}

async function resolveProfileSelection(config: DBhopperConfig): Promise<ProfileSelection | undefined> {
  const selected = await resolveSelectedClaimProfileFile(config);
  if (!selected) {
    return undefined;
  }
  return {
    profileFile: selected.file.fileName,
    profileId: selected.file.id,
    profilePath: selected.file.filePath,
    profileDir: selected.settings.claimProfilesDir,
  };
}

async function readPrivateProfile(selection: ProfileSelection) {
  await assertInside(selection.profileDir, selection.profilePath);
  const raw = await fs.readFile(selection.profilePath, "utf8");
  return stripProfileRoutingFields(parsePrivateProfileToml(raw, selection.profilePath));
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

function materializeClaim(
  privateProfile: DBhopperClaim,
  storedClaim: DBhopperClaim,
  claimId: string,
) {
  return mergeClaims(privateProfile, {
    ...storedClaim,
    claimId: storedClaim.claimId || claimId,
  });
}

function stripProfileRoutingFields(profile: DBhopperClaim): DBhopperClaim {
  const { ID_CLM: _ID_CLM, ...rest } = profile;
  return rest;
}
