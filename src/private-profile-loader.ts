import fs from "node:fs/promises";

import type { PrivateIdFile } from "./private-settings.js";
import type { DBhopperConfig } from "./types.js";

interface ResolvedPrivateIdFile {
  file: PrivateIdFile;
}

type ResolveSelectedPrivateFile = (
  config: DBhopperConfig,
) => Promise<ResolvedPrivateIdFile | undefined>;

export async function readSelectedPrivateToml<T>(
  config: DBhopperConfig,
  resolveFile: ResolveSelectedPrivateFile,
  parse: (text: string, source: string) => T,
) {
  const resolved = await resolveFile(config);
  if (!resolved) {
    return undefined;
  }
  const raw = await fs.readFile(resolved.file.filePath, "utf8");
  return {
    file: resolved.file,
    parsed: parse(raw, resolved.file.filePath),
  };
}
