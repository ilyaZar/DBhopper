export declare function assertTable(value: unknown, source: string): asserts value is Record<string, unknown>;
export declare function assertString(value: unknown, source: string): asserts value is string;
export declare function assertNumericId(value: string, source: string): void;
export declare function assertNumericIdString(value: unknown, source: string): asserts value is string;
export declare function assertKnownKeys(value: Record<string, unknown>, allowed: Set<string>, source: string): void;
export declare function assertSection(value: unknown, source: string, allowedKeys: string[]): asserts value is Record<string, unknown>;
