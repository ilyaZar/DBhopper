import { errorMessage } from "./errors.js";
import type { ValidationMessage } from "./types.js";

export function validationError(
  code: string,
  message: string,
): ValidationMessage {
  return { code, message, severity: "error" };
}

export function validationErrorFromException(
  code: string,
  error: unknown,
): ValidationMessage {
  return validationError(code, errorMessage(error));
}
