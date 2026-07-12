export { createAppError, isAppError, DEFAULT_APP_ERROR_MESSAGE } from "./create-app-error";
export { createErrorRegistry, getErrorRegistry, setErrorRegistry } from "./registry";
export { err, ok, type Err, type Ok, type Result } from "./result";
export type {
  AppError,
  AppErrorOptions,
  AppErrorSource,
  AppErrorType,
  ErrorFeedback,
  ErrorPatternDefinition,
  ErrorPatternRegistryBucket,
  ErrorPrefixDefinition,
  ErrorPrefixRegistryBucket,
  ErrorRegistry,
  ErrorRegistryBucket,
} from "./types";
