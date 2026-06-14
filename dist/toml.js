import { parse } from "smol-toml";
import { errorMessage } from "./errors.js";
export function parseToml(text, source) {
    try {
        return parse(text);
    }
    catch (error) {
        throw new Error(`${source}: invalid TOML: ${errorMessage(error)}`);
    }
}
export function tryParseToml(text) {
    try {
        return parse(text);
    }
    catch {
        return undefined;
    }
}
