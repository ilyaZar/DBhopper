import { errorMessage } from "./errors.js";
export function validationError(code, message) {
    return { code, message, severity: "error" };
}
export function validationErrorFromException(code, error) {
    return validationError(code, errorMessage(error));
}
