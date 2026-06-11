import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertClaimTomlShape, mergeClaims, parseClaimToml, parsePrivateProfileToml, profileFieldsInClaim, schemaValidationMessages, stringifyClaimToml, stringifySubmittedRecipeToml, } from "./claim-toml.js";
import { configuredProfilesDir, privateSettingsStatus, resolveSelectedProfileFile, } from "./private-settings.js";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLAIM_ID_MAX = 80;
export function resolveWorkspace(config = {}) {
    const root = path.resolve(config.workspaceRoot || PACKAGE_ROOT);
    return {
        root,
        claimsDir: path.join(root, "claims"),
        assetsDir: path.join(root, "assets"),
        profilesDir: path.join(root, "assets", "private", "profiles"),
    };
}
export async function ensureWorkspace(config = {}) {
    const workspace = resolveWorkspace(config);
    await fs.mkdir(workspace.claimsDir, { recursive: true });
    await fs.mkdir(workspace.assetsDir, { recursive: true });
    await fs.mkdir(await configuredProfilesDir(config), { recursive: true });
    return workspace;
}
export function normalizeClaimId(value) {
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
export function claimPaths(claimId, config = {}) {
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
export async function readClaim(claimId, config = {}) {
    const paths = claimPaths(claimId, config);
    const raw = await fs.readFile(paths.claimPath, "utf8");
    const storedClaim = parseClaimToml(raw, paths.claimPath);
    const profileSelection = await resolveProfileSelection(requestedProfileName(storedClaim, config), config);
    const privateProfile = profileSelection
        ? await readPrivateProfile(profileSelection)
        : {};
    const claim = materializeClaim(privateProfile, storedClaim, paths.claimId, profileSelection?.profileName);
    return {
        claimId: paths.claimId,
        claimDir: paths.claimDir,
        claimPath: paths.claimPath,
        recipePath: paths.recipePath,
        profileName: profileSelection?.profileName,
        storedClaim,
        claim,
        copiedFiles: claim.files || [],
    };
}
export async function listClaims(config = {}) {
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
            const profileSelection = await resolveProfileSelection(requestedProfileName(storedClaim, config), config);
            const privateProfile = profileSelection
                ? await readPrivateProfile(profileSelection)
                : {};
            const claim = materializeClaim(privateProfile, storedClaim, entry.name, profileSelection?.profileName);
            claims.push({
                claimId: entry.name,
                status: claim.status || "draft",
                profileName: profileSelection?.profileName,
                journey: claim.journey,
                claimant: redactClaimant(claim.claimant),
                fileCount: claim.files?.length || 0,
            });
        }
        catch {
            claims.push({
                claimId: entry.name,
                status: "unreadable",
                fileCount: 0,
            });
        }
    }
    return claims.sort((a, b) => a.claimId.localeCompare(b.claimId));
}
export async function prepareClaim(params, config = {}) {
    if (params.confirm !== true) {
        throw new Error("confirm must be true before writing a claim workspace");
    }
    const workspace = await ensureWorkspace(config);
    const incoming = params.claim || {};
    const privateFields = profileFieldsInClaim(incoming);
    if (privateFields.length > 0) {
        throw new Error([
            `claim data must not include private fields: ${privateFields.join(", ")}`,
            "store claimant and bank data in assets/private/profiles/*.toml",
        ].join("; "));
    }
    const explicitProfileName = params.profileName ?? incoming.profileName ?? config.activeProfileName;
    const profileSelection = await resolveProfileSelection(normalizeOptionalProfileName(explicitProfileName), config);
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
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
    }
    const copiedFiles = [];
    for (const file of params.files || []) {
        copiedFiles.push(await copyClaimFile(file, { claimDir, workspace }));
    }
    const existingFiles = Array.isArray(incoming.files) ? incoming.files : [];
    const storedClaim = {
        ...incoming,
        version: 1,
        claimId,
        ...(explicitProfileName && profileSelection?.profileName
            ? { profileName: profileSelection.profileName }
            : {}),
        status: incoming.status || "draft",
        files: [...existingFiles, ...copiedFiles],
    };
    assertClaimTomlShape(storedClaim, claimPath);
    const claim = materializeClaim(privateProfile, storedClaim, claimId, profileSelection?.profileName);
    await fs.writeFile(`${claimPath}.tmp`, stringifyClaimToml(storedClaim), "utf8");
    await fs.rename(`${claimPath}.tmp`, claimPath);
    return {
        claimId,
        claimDir,
        claimPath,
        recipePath,
        profileName: profileSelection?.profileName,
        storedClaim,
        claim,
        copiedFiles,
    };
}
export async function recordClaimArtifact(claimId, file, config = {}) {
    const prepared = await readClaim(claimId, config);
    const storedClaim = {
        ...(prepared.storedClaim || {}),
        files: [...(prepared.storedClaim?.files || []), file],
    };
    assertClaimTomlShape(storedClaim, prepared.claimPath);
    await fs.writeFile(prepared.claimPath, stringifyClaimToml(storedClaim), "utf8");
    const profileSelection = await resolveProfileSelection(requestedProfileName(storedClaim, config), config);
    return materializeClaim(profileSelection ? await readPrivateProfile(profileSelection) : {}, storedClaim, prepared.claimId, profileSelection?.profileName);
}
export async function writeSubmittedRecipe(prepared) {
    if (!prepared.recipePath) {
        throw new Error("prepared claim is missing recipePath");
    }
    await fs.writeFile(`${prepared.recipePath}.tmp`, stringifySubmittedRecipeToml(prepared.claim), "utf8");
    await fs.rename(`${prepared.recipePath}.tmp`, prepared.recipePath);
    return prepared.recipePath;
}
export async function validateWorkspaceTomlFiles(config = {}) {
    const workspace = await ensureWorkspace(config);
    const profileDir = await configuredProfilesDir(config);
    const messages = [];
    const settingsStatus = await privateSettingsStatus(config);
    if (settingsStatus.settings.exists) {
        messages.push(...settingsStatus.messages);
    }
    for (const profilePath of await listTomlFiles(profileDir)) {
        try {
            const parsed = parsePrivateProfileToml(await fs.readFile(profilePath, "utf8"), profilePath);
            messages.push(...schemaValidationMessages(parsed, "profile", profilePath));
        }
        catch (error) {
            messages.push({
                code: "invalid_profile_toml",
                message: error instanceof Error ? error.message : String(error),
                severity: "error",
            });
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
            const profileSelection = await resolveProfileSelection(requestedProfileName(parsed, config), config);
            if (profileSelection) {
                await readPrivateProfile(profileSelection);
            }
        }
        catch (error) {
            messages.push({
                code: "invalid_claim_toml",
                message: error instanceof Error ? error.message : String(error),
                severity: "error",
            });
        }
    }
    return {
        ok: messages.every((message) => message.severity !== "error"),
        messages,
    };
}
async function copyClaimFile(file, paths) {
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
export async function resolveClaimFilePath(claimDir, value) {
    const resolved = path.resolve(claimDir, value);
    await assertInside(claimDir, resolved);
    return resolved;
}
function safeFileName(value) {
    const normalized = value.replace(/[^\w.,@() -]+/g, "_").replace(/\s+/g, " ").trim();
    if (!normalized || normalized === "." || normalized === "..") {
        throw new Error("targetName must be a safe file name");
    }
    return normalized;
}
async function resolveProfileSelection(profileName, config) {
    const profileDir = await configuredProfilesDir(config);
    if (profileName) {
        const normalized = normalizeProfileName(profileName);
        const profilePath = path.resolve(profileDir, normalized);
        await assertInside(profileDir, profilePath);
        return {
            profileName: normalized,
            profilePath,
            profileDir,
        };
    }
    const selected = await resolveSelectedProfileFile(config);
    if (!selected) {
        return undefined;
    }
    return {
        profileName: selected.file.fileName,
        profileId: selected.file.id,
        profilePath: selected.file.filePath,
        profileDir: selected.settings.profilesDir,
    };
}
async function readPrivateProfile(selection) {
    await assertInside(selection.profileDir, selection.profilePath);
    const raw = await fs.readFile(selection.profilePath, "utf8");
    return stripProfileRoutingFields(parsePrivateProfileToml(raw, selection.profilePath));
}
async function listTomlFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".toml"))
        .map((entry) => path.join(dir, entry.name))
        .sort();
}
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function assertInside(root, target) {
    const rel = path.relative(path.resolve(root), path.resolve(target));
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error("path must stay inside the claim directory");
    }
}
function redactClaimant(claimant) {
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
export function redactEmail(value) {
    const [local, domain] = value.split("@");
    if (!domain) {
        return "[redacted-email]";
    }
    return `${local.slice(0, 2)}***@${domain}`;
}
function materializeClaim(privateProfile, storedClaim, claimId, profileName) {
    return mergeClaims(privateProfile, {
        ...storedClaim,
        claimId: storedClaim.claimId || claimId,
        ...(profileName ? { profileName } : {}),
    });
}
function requestedProfileName(claim, config) {
    return normalizeOptionalProfileName(claim.profileName ?? config.activeProfileName);
}
function normalizeOptionalProfileName(value) {
    return value ? normalizeProfileName(value) : undefined;
}
function normalizeProfileName(value) {
    const raw = value.trim();
    const withExtension = raw.endsWith(".toml") ? raw : `${raw}.toml`;
    const baseName = path.basename(withExtension);
    if (baseName !== withExtension || !/^[a-zA-Z0-9._-]+\.toml$/.test(baseName)) {
        throw new Error("profileName must be a safe TOML file name under assets/private/profiles");
    }
    return baseName;
}
function stripProfileRoutingFields(profile) {
    const { ID_PRF: _ID_PRF, ...rest } = profile;
    return rest;
}
