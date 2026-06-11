declare module "openclaw/plugin-sdk/plugin-entry" {
  export function definePluginEntry(value: unknown): unknown;
}

declare module "openclaw/plugin-sdk/tool-plugin" {
  export function defineToolPlugin(value: unknown): unknown;
  export function getToolPluginMetadata(value: unknown): unknown;
}
