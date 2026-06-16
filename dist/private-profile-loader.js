import fs from "node:fs/promises";
export async function readSelectedPrivateToml(config, resolveFile, parse) {
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
