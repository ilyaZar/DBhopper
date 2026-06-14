import type { ValidationMessage } from "./types.js";
export declare function validationError(code: string, message: string): ValidationMessage;
export declare function validationErrorFromException(code: string, error: unknown): ValidationMessage;
