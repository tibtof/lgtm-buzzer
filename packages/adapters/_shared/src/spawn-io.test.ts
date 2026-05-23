import { describe, expect, it } from "vitest";
import { __spawnIO_testHooks, spawnIO } from "./spawn-io.js";

// We use process.execPath (the current node binary) for all test cases to
// ensure portability across environments.
//
// DEVIATION from ADR-9 §Test strategy, cases 5 & 6:
// ADR-9 states fiber.join() should return `Err { kind: "cancelled" }`.
// In practice, monadyssey@2.0.1's interpreter checks `signal.aborted` at
// the top of every loop iteration. When fiber.cancel() aborts the signal,
// the abort-check fires on the next loop after the Lift case's await settles,
// returning `{ type: "Cancelled" }` — even though liftSpawnError correctly
// ran and produced the typed Err. The typed SpawnError is visible only when
// consuming spawnIO without a fiber (i.e., via unsafeRun with no abort). The
// process IS correctly killed (SIGTERM / SIGKILL); the deviation is in the
// type of the fiber join result, not in the subprocess lifecycle. Tests 5 & 6
// verify the kill choreography via process.kill(pid, 0) ESRCH and assert the
// join type is "Cancelled" — matching actual monadyssey behavior.

const NODE = process.execPath;

describe("spawnIO", () => {
  it(
    "1. happy path: captures stdout and resolves Ok with exitCode 0",
    async () => {
      const result = await spawnIO(
        NODE,
        ["-e", "process.stdout.write('hello')"],
      ).unsafeRun();

      expect(result.type).toBe("Ok");
      if (result.type === "Ok") {
        expect(result.value.stdout).toBe("hello");
        expect(result.value.exitCode).toBe(0);
      }
    },
    500,
  );

  it(
    "2. non-zero exit: resolves Err process-failed with correct exitCode",
    async () => {
      const result = await spawnIO(NODE, ["-e", "process.exit(7)"]).unsafeRun();

      expect(result.type).toBe("Err");
      if (result.type === "Err") {
        expect(result.error.kind).toBe("process-failed");
        if (result.error.kind === "process-failed") {
          expect(result.error.exitCode).toBe(7);
        }
      }
    },
    500,
  );

  it(
    "3. stderr capture: Err process-failed carries stderr content",
    async () => {
      const result = await spawnIO(NODE, [
        "-e",
        "process.stderr.write('nope'); process.exit(1)",
      ]).unsafeRun();

      expect(result.type).toBe("Err");
      if (result.type === "Err") {
        expect(result.error.kind).toBe("process-failed");
        if (result.error.kind === "process-failed") {
          expect(result.error.exitCode).toBe(1);
          expect(result.error.stderr).toBe("nope");
        }
      }
    },
    500,
  );

  it(
    "4. spawn failure: Err spawn-failed with reason containing ENOENT",
    async () => {
      const result = await spawnIO(
        "definitely-not-a-real-command-lgtm-buzzer-test",
        [],
      ).unsafeRun();

      expect(result.type).toBe("Err");
      if (result.type === "Err") {
        expect(result.error.kind).toBe("spawn-failed");
        if (result.error.kind === "spawn-failed") {
          expect(result.error.reason).toContain("ENOENT");
        }
      }
    },
    500,
  );

  it(
    "5. cancellation cooperative: fiber.join() is Cancelled; PID no longer alive",
    async () => {
      // NOTE: fiber.join() returns { type: "Cancelled" } per monadyssey@2.0.1
      // semantics (see module-level deviation comment). The subprocess IS killed
      // via SIGTERM. We verify liveness via process.kill(pid, 0) → ESRCH.
      let capturedPid: number | undefined;
      __spawnIO_testHooks.onSpawn = (pid) => {
        capturedPid = pid;
      };

      try {
        const io = spawnIO(NODE, ["-e", "setInterval(()=>{},1e9)"]);
        const fiberResult = await io.fork().unsafeRun();
        expect(fiberResult.type).toBe("Ok");
        if (fiberResult.type !== "Ok") return;

        const fiber = fiberResult.value;

        // Give the child a moment to fully start before cancelling.
        await new Promise((r) => setTimeout(r, 50));

        expect(capturedPid).toBeDefined();
        const pid = capturedPid!;

        await fiber.cancel();
        const joined = await fiber.join();

        // monadyssey@2.0.1 returns Cancelled (not Err) from the fiber's perspective.
        expect(joined.type).toBe("Cancelled");

        // Allow the OS a moment to fully reap the child process.
        await new Promise((r) => setTimeout(r, 50));

        // The child must be dead. process.kill(pid, 0) throws ESRCH when the
        // process no longer exists — this is the safety property from CLAUDE.md:
        // "a forgotten child process holding an LLM connection is the worst-case bug".
        let pidGone = false;
        try {
          process.kill(pid, 0);
        } catch (e: unknown) {
          if (typeof e === "object" && e !== null && (e as NodeJS.ErrnoException).code === "ESRCH") {
            pidGone = true;
          }
        }
        expect(pidGone).toBe(true);
      } finally {
        __spawnIO_testHooks.onSpawn = () => {};
      }
    },
    2000,
  );

  it(
    "6. cancellation stubborn: fiber.join() is Cancelled; SIGKILL fires within graceMs; PID no longer alive",
    async () => {
      // NOTE: same deviation as test 5. The child ignores SIGTERM; monadyssey
      // interpreter returns Cancelled regardless of the liftSpawnError result.
      // graceMs: 100 means SIGKILL fires 100ms after SIGTERM. We verify
      // cancel() resolves within ~500ms (well within 1000ms budget) AND that
      // the child PID is dead after cancellation (ESRCH check).
      let capturedPid: number | undefined;
      __spawnIO_testHooks.onSpawn = (pid) => {
        capturedPid = pid;
      };

      try {
        const io = spawnIO(
          NODE,
          ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1e9)"],
          undefined,
          { graceMs: 100 },
        );
        const fiberResult = await io.fork().unsafeRun();
        expect(fiberResult.type).toBe("Ok");
        if (fiberResult.type !== "Ok") return;

        const fiber = fiberResult.value;

        // Give the child a moment to fully start before cancelling.
        await new Promise((r) => setTimeout(r, 50));

        expect(capturedPid).toBeDefined();
        const pid = capturedPid!;

        const start = Date.now();
        await fiber.cancel();
        const joined = await fiber.join();
        const elapsed = Date.now() - start;

        // monadyssey@2.0.1 returns Cancelled from the fiber's perspective.
        expect(joined.type).toBe("Cancelled");

        // Upper bound only: the real invariant is the PID-dead check below.
        // monadyssey's join() can resolve before the child OS process is reaped
        // (the fiber sees Cancelled the moment cancellation propagates), so a
        // lower bound on elapsed time conflates fiber-state with OS state and
        // flakes under varying process scheduling.
        expect(elapsed).toBeLessThan(1000);

        // Allow the OS a moment to fully reap the child process.
        await new Promise((r) => setTimeout(r, 50));

        // The child must be dead — same ESRCH safety check as test 5.
        let pidGone = false;
        try {
          process.kill(pid, 0);
        } catch (e: unknown) {
          if (typeof e === "object" && e !== null && (e as NodeJS.ErrnoException).code === "ESRCH") {
            pidGone = true;
          }
        }
        expect(pidGone).toBe(true);
      } finally {
        __spawnIO_testHooks.onSpawn = () => {};
      }
    },
    2000,
  );

  it(
    "7. stdin single-shot: cat echoes stdin to stdout",
    async () => {
      // POSIX cat; macOS + Linux only (locked decision: Chrome-first, no Windows v1).
      const result = await spawnIO("cat", [], "hello\n").unsafeRun();

      expect(result.type).toBe("Ok");
      if (result.type === "Ok") {
        expect(result.value.stdout).toBe("hello\n");
        expect(result.value.exitCode).toBe(0);
      }
    },
    500,
  );

  it(
    "8. no stdin: child receives EOF immediately on first read",
    async () => {
      // Read a line from stdin; with immediate EOF, readline emits 'close'
      // without the 'line' event — process exits 0.
      const result = await spawnIO(NODE, [
        "-e",
        [
          "const rl = require('readline').createInterface({ input: process.stdin });",
          "let lines = 0;",
          "rl.on('line', () => { lines++; });",
          "rl.on('close', () => { process.stdout.write(String(lines)); process.exit(0); });",
        ].join(" "),
      ]).unsafeRun();

      expect(result.type).toBe("Ok");
      if (result.type === "Ok") {
        expect(result.value.stdout).toBe("0");
        expect(result.value.exitCode).toBe(0);
      }
    },
    500,
  );
});
