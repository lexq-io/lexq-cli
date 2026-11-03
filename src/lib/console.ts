/** Base URL of the LexQ console, for tool descriptions and help text that send people there. */
export const CONSOLE_URL = 'https://console.lexq.io';

/**
 * Where a failure log gets resolved or ignored. LexQ allows that only to an organization admin
 * signed in to the console. A member without the admin role cannot, and neither can an API key.
 * The CLI and both MCP servers (`lexq serve --mcp` and https://mcp.lexq.io) call LexQ with an API
 * key, so they can only read failure logs. This note appears where people look for the action:
 * the logs tool descriptions and `lexq logs --help`.
 */
export const FAILURE_LOG_CONSOLE_NOTE = `Logs can be read here but not resolved or ignored. An organization admin does that in the LexQ console: Management → Failure Logs (${CONSOLE_URL}/management/failure-logs).`;
