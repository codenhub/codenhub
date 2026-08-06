export { createAppError, isAppError, DEFAULT_APP_ERROR_MESSAGE } from "./create-app-error";
export { createErrorRegistry, getErrorRegistry, setErrorRegistry, freezeRegistry } from "./registry";
export {
  andThen,
  andThenAsync,
  attempt,
  attemptAsync,
  err,
  map,
  mapAsync,
  match,
  ok,
  unwrap,
  unwrapOr,
  type Err,
  type Ok,
  type Result,
} from "./result";
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
  ReadonlyErrorRegistry,
} from "./types";
