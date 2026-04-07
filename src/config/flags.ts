/** Read at call time so the Settings route can toggle it live without a restart. */
export function ADMIN_DEBUG_LOGS(): boolean {
    return process.env.ADMIN_DEBUG_LOGS === "true";
}