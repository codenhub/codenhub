/**
 * Opt-in error registry presets and their raw feedback maps for common runtimes.
 *
 * @packageDocumentation
 */

export { browserErrorRegistry, browserErrorNames, browserErrorPatterns } from "./browser";
export { nodeErrorRegistry, nodeErrorCodes, nodeErrorPatterns } from "./node";
export { supabaseErrorRegistry, supabaseErrorCodes, supabaseErrorNames } from "./supabase";
