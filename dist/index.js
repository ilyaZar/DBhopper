import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { buildDBhopperApprovalDescription, createDBhopperTools, OPTIONAL_TOOL_NAMES, resolveApprovalToolNames, } from "./tools.js";
export default definePluginEntry({
    id: "dbhopper",
    name: "DBhopper",
    description: "NRW Mobilitätsgarantie claim workspace and guarded browser filing tools.",
    register(api) {
        const pluginConfig = api.pluginConfig ?? {};
        const tools = createDBhopperTools(pluginConfig);
        const approvalToolNames = resolveApprovalToolNames(pluginConfig);
        for (const tool of tools) {
            api.registerTool(tool, OPTIONAL_TOOL_NAMES.has(tool.name) ? { optional: true } : undefined);
        }
        api.on("before_tool_call", (event) => {
            if (!approvalToolNames.has(event.toolName)) {
                return;
            }
            return {
                requireApproval: {
                    title: "Run DBhopper claim operation",
                    description: buildDBhopperApprovalDescription({
                        toolName: event.toolName,
                        params: event.params,
                    }),
                    severity: event.params?.mode === "submit" ? "danger" : "warning",
                    timeoutMs: 120000,
                    timeoutBehavior: "deny",
                },
            };
        }, { priority: 80, timeoutMs: 5000 });
    },
});
