export type TomlKeyMap = Record<string, string>;
export type TomlKeyMapByPath = Record<string, TomlKeyMap>;
export declare function parseToml(text: string, source: string): unknown;
export declare function tryParseToml(text: string): unknown | undefined;
export declare function normalizeTomlKeys(value: unknown, source: string, aliasesByPath: TomlKeyMapByPath): unknown;
export declare function renameTomlKeys(value: unknown, keyNamesByPath: TomlKeyMapByPath): unknown;
