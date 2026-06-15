import { CLAIM_TOOL_NAMES } from "./claim-tool-contracts.js";
export { CLAIM_TOOL_NAMES } from "./claim-tool-contracts.js";
export const PRIVATE_SETTINGS_STATUS_TOOL_NAME = "dbhopper_private_settings_status";
export const PRIVATE_SETTINGS_SELECT_TOOL_NAME = "dbhopper_private_settings_select";
export const CREDENTIALS_VALIDATE_TOOL_NAME = "dbhopper_credentials_validate";
export const DB_STANDARD_LOGIN_CHECK_TOOL_NAME = "dbhopper_db_standard_login_check";
export const DB_MARKETPLACE_ACCESS_CHECK_TOOL_NAME = "dbhopper_db_marketplace_access_check";
export const DB_API_CREDENTIAL_PROBE_TOOL_NAME = "dbhopper_db_api_credential_probe";
export const DB_DELAY_RESEARCH_TOOL_NAME = "dbhopper_db_delay_research";
export const QUERY_DB_DELAY_TOOL_NAME = "dbhopper_query_db_delay";
export const TICKET_BUYING_RESEARCH_TOOL_NAME = "dbhopper_ticket_buying_research";
export const TICKET_BUYING_DRY_RUN_TOOL_NAME = "dbhopper_ticket_buying_dry_run";
export const TICKET_CHECKOUT_DRY_RUN_TOOL_NAME = "dbhopper_ticket_checkout_dry_run";
export const ALWAYS_ENABLED_TOOL_NAMES = [
    PRIVATE_SETTINGS_STATUS_TOOL_NAME,
    PRIVATE_SETTINGS_SELECT_TOOL_NAME,
    CREDENTIALS_VALIDATE_TOOL_NAME,
];
export const TICKET_BUYING_ACCESS_TOOL_NAMES = [
    DB_STANDARD_LOGIN_CHECK_TOOL_NAME,
];
export const DELAY_RETRIEVAL_ACCESS_TOOL_NAMES = [
    DB_MARKETPLACE_ACCESS_CHECK_TOOL_NAME,
    DB_API_CREDENTIAL_PROBE_TOOL_NAME,
];
export const DB_DELAY_TOOL_NAMES = [
    DB_DELAY_RESEARCH_TOOL_NAME,
    QUERY_DB_DELAY_TOOL_NAME,
];
export const TICKET_BUYING_WORKFLOW_TOOL_NAMES = [
    TICKET_BUYING_RESEARCH_TOOL_NAME,
    TICKET_BUYING_DRY_RUN_TOOL_NAME,
    TICKET_CHECKOUT_DRY_RUN_TOOL_NAME,
];
export const DELAY_RETRIEVAL_TOOL_NAMES = [
    ...DELAY_RETRIEVAL_ACCESS_TOOL_NAMES,
    ...DB_DELAY_TOOL_NAMES,
];
export const AUTONOMOUS_TICKET_BUYING_TOOL_NAMES = [
    ...TICKET_BUYING_ACCESS_TOOL_NAMES,
    ...TICKET_BUYING_WORKFLOW_TOOL_NAMES,
];
export const PUBLIC_TOOL_NAMES = [
    ...CLAIM_TOOL_NAMES,
    ...ALWAYS_ENABLED_TOOL_NAMES,
    ...TICKET_BUYING_ACCESS_TOOL_NAMES,
    ...DELAY_RETRIEVAL_ACCESS_TOOL_NAMES,
    ...DB_DELAY_TOOL_NAMES,
    ...TICKET_BUYING_WORKFLOW_TOOL_NAMES,
];
