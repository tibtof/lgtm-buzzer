import { describe, expect, it } from "vitest";
import type { Frame } from "@lgtm-buzzer/protocol";
import { createCheckAuth } from "./auth-status.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCheckAuth = (sendFrame: (frame: Frame) => Promise<Frame>) =>
  createCheckAuth({
    sendFrame,
    newCorrelationId: () => "test-corr-id",
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCheckAuth", () => {
  it("round-trip: host stub returns 6 rows → Right<AuthStatus[]>", async () => {
    const statuses = [
      { adapterId: "claude-cli", ok: true, detail: "uses CLI's own login" },
      { adapterId: "codex-cli", ok: true, detail: "uses CLI's own login" },
      { adapterId: "copilot-cli", ok: true, detail: "uses CLI's own login" },
      { adapterId: "claude-api", ok: true, detail: "via ANTHROPIC_API_KEY env" },
      { adapterId: "github", ok: true, detail: "via GITHUB_TOKEN env" },
      { adapterId: "ado", ok: false, hint: "Run `az login` or export AZURE_DEVOPS_EXT_PAT" },
    ];

    const checkAuth = makeCheckAuth(async () => ({
      v: 1 as const,
      kind: "check-auth-response" as const,
      correlationId: "test-corr-id",
      payload: { statuses },
    }));

    const result = await checkAuth();
    expect(result.self.type).toBe("Right");
    if (result.self.type === "Right") {
      expect(result.self.value).toHaveLength(6);
      expect(result.self.value[0]?.adapterId).toBe("claude-cli");
      expect(result.self.value[5]?.adapterId).toBe("ado");
      expect(result.self.value[5]?.ok).toBe(false);
    }
  });

  it("host returns ErrorFrame with 'connect failed' → Left<host-not-installed>", async () => {
    const checkAuth = makeCheckAuth(async () => ({
      v: 1 as const,
      kind: "error" as const,
      correlationId: "test-corr-id",
      payload: {
        reason: "internal" as const,
        message: "connect failed: no native host",
      },
    }));

    const result = await checkAuth();
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("host-not-installed");
    }
  });

  it("host returns ErrorFrame with other message → Left<host-error>", async () => {
    const checkAuth = makeCheckAuth(async () => ({
      v: 1 as const,
      kind: "error" as const,
      correlationId: "test-corr-id",
      payload: {
        reason: "internal" as const,
        message: "something else went wrong",
      },
    }));

    const result = await checkAuth();
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("host-error");
      if (result.self.value.kind === "host-error") {
        expect(result.self.value.message).toContain("something else went wrong");
      }
    }
  });

  it("sendFrame throws → Left<internal>", async () => {
    const checkAuth = makeCheckAuth(async () => {
      throw new Error("network error");
    });

    const result = await checkAuth();
    expect(result.self.type).toBe("Left");
    if (result.self.type === "Left") {
      expect(result.self.value.kind).toBe("internal");
      if (result.self.value.kind === "internal") {
        expect(result.self.value.message).toContain("network error");
      }
    }
  });

  it("sends a check-auth-request frame with the given correlationId", async () => {
    let sentFrame: Frame | undefined;
    const checkAuth = createCheckAuth({
      sendFrame: async (frame) => {
        sentFrame = frame;
        return {
          v: 1 as const,
          kind: "check-auth-response" as const,
          correlationId: frame.correlationId,
          payload: { statuses: [] },
        };
      },
      newCorrelationId: () => "my-corr-123",
    });

    await checkAuth();
    expect(sentFrame?.kind).toBe("check-auth-request");
    expect(sentFrame?.correlationId).toBe("my-corr-123");
    expect(sentFrame?.payload).toEqual({});
  });
});
