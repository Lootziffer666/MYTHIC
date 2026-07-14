import os from "node:os";
import fs from "node:fs";
import path from "node:path";

// Isolated work dir per test run + forced simulation mode, so stack-engine tests
// never touch a real Docker socket or a developer's local .deploy/ state.
process.env.MYTHIC_WORKDIR = fs.mkdtempSync(path.join(os.tmpdir(), "mythic-test-"));
process.env.MYTHIC_SIMULATION = "true";
process.env.MYTHIC_MASTER_KEY = "test-master-key-not-for-production-use-only";
