import type { Locator } from "playwright-core";

export interface SensitiveFillOptions {
  timeout?: number;
}

export async function fillSensitiveTextControl(
  control: Locator,
  value: string,
  options: SensitiveFillOptions = {},
) {
  const timeout = options.timeout ?? 10000;
  try {
    await control.waitFor({ state: "visible", timeout });
    await control.evaluate(
      (element, secret) => {
        if (
          !(element instanceof HTMLInputElement) &&
          !(element instanceof HTMLTextAreaElement)
        ) {
          throw new Error("target is not a text control");
        }

        const prototype = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        if (valueSetter) {
          valueSetter.call(element, secret);
        } else {
          element.value = secret;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      },
      value,
      { timeout },
    );
  } catch {
    throw new Error("sensitive text control could not be filled");
  }
}
