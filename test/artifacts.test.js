import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createTimestampedArtifactDir,
  safeArtifactSegment,
} from "../dist/artifacts.js";

describe("dbhopper artifacts", () => {
  it("sanitizes artifact filename segments without changing stable separators", () => {
    assert.equal(
      safeArtifactSegment("Checkout Summary 01:02.png"),
      "checkout-summary-01-02.png",
    );
    assert.equal(safeArtifactSegment("already_safe-label.txt"), "already_safe-label.txt");
  });

  it("creates timestamped artifact directories with the caller-owned prefix", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dbhopper-artifacts-"));
    const artifactDir = await createTimestampedArtifactDir(
      root,
      "ticket-purchase-test-run",
      new Date("2026-06-15T12:34:56.789Z"),
    );

    assert.equal(
      path.basename(artifactDir),
      "ticket-purchase-test-run-2026-06-15T12-34-56-789Z",
    );
    assert.equal(await exists(artifactDir), true);
  });
});

async function exists(target) {
  return fs.stat(target).then(() => true, () => false);
}
