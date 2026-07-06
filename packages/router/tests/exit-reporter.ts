import type { Reporter, FullResult } from "@playwright/test/reporter";

class ExitReporter implements Reporter {
  async onEnd(result: FullResult) {
    console.log(`\nExitReporter: Tests finished with status "${result.status}". Force exiting in 100ms...`);
    // Force exit after a small delay to allow other reporters and writers to finish.
    // This works around a known issue where the Playwright WebKit process/socket
    // hangs indefinitely on Windows after all tests are finished.
    setTimeout(() => {
      process.exit(result.status === "passed" ? 0 : 1);
    }, 100);
  }
}

export default ExitReporter;
