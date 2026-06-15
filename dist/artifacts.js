import fs from "node:fs/promises";
import path from "node:path";
export async function createTimestampedArtifactDir(root, prefix, now = new Date()) {
    const timestamp = now.toISOString().replace(/[:.]/g, "-");
    const artifactDir = path.join(root, `${prefix}-${timestamp}`);
    await fs.mkdir(artifactDir, { recursive: true });
    return artifactDir;
}
export function safeArtifactSegment(value) {
    return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").toLowerCase();
}
