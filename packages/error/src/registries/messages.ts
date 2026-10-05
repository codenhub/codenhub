/**
 * The one message every developer-facing mapping carries: a failure the person using the
 * application did not cause and cannot fix, such as a missing table or an invalid state. It
 * names no internals; the detail stays on `AppError.originalError` for logs.
 *
 * @internal
 */
export const DEVELOPER_FAULT_MESSAGE =
  "Something went wrong on our side, and it isn't caused by anything you did. Contact support if it keeps happening.";
