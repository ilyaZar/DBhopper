import type { PrivateIdFile } from "./private-settings.js";
import type { DBhopperConfig } from "./types.js";
interface ResolvedPrivateIdFile {
    file: PrivateIdFile;
}
type ResolveSelectedPrivateFile = (config: DBhopperConfig) => Promise<ResolvedPrivateIdFile | undefined>;
export declare function readSelectedPrivateToml<T>(config: DBhopperConfig, resolveFile: ResolveSelectedPrivateFile, parse: (text: string, source: string) => T): Promise<{
    file: PrivateIdFile;
    parsed: T;
} | undefined>;
export {};
