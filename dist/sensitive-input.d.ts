import type { Locator } from "playwright-core";
export interface SensitiveFillOptions {
    timeout?: number;
}
export declare function fillSensitiveTextControl(control: Locator, value: string, options?: SensitiveFillOptions): Promise<void>;
