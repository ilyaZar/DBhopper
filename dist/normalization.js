export function compactUiText(value) {
    return value.replace(/\s+/g, " ").trim();
}
export function normalizeUiText(value) {
    return compactUiText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/ö/g, "o")
        .replace(/ä/g, "a")
        .replace(/ü/g, "u")
        .replace(/ß/g, "ss");
}
export function normalizeUiDate(value) {
    const trimmed = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) {
        return checkedUiDateParts(iso[1], iso[2], iso[3]);
    }
    const slash = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (slash) {
        return checkedUiDateParts(slash[3], slash[2], slash[1]);
    }
    const dot = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
    if (dot) {
        return checkedUiDateParts(dot[3], dot[2], dot[1]);
    }
    return undefined;
}
export function normalizeUiDateComparable(value) {
    return normalizeUiDate(value) ?? value.replace(/\D/g, "");
}
export function normalizeIban(value) {
    return value.replace(/\s+/g, "").toUpperCase();
}
export function normalizeCountry(value) {
    const normalized = normalizeUiText(value);
    if (["de", "deu", "deutschland", "germany"].includes(normalized)) {
        return "germany";
    }
    return normalized;
}
export function normalizeOption(value) {
    return normalizeCountry(value);
}
export function normalizeCardNumber(value) {
    return value.replace(/\s+/g, "");
}
function checkedUiDateParts(year, month, day) {
    const yyyy = Number(year);
    const mm = Number(month);
    const dd = Number(day);
    const date = new Date(Date.UTC(yyyy, mm - 1, dd));
    const valid = date.getUTCFullYear() === yyyy &&
        date.getUTCMonth() === mm - 1 &&
        date.getUTCDate() === dd;
    return valid ? `${year}-${month}-${day}` : undefined;
}
