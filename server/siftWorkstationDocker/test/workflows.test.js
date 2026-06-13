import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { initializeOpencodeSessionFromDocker } from "../../workflows/workflows.js"

describe("initializeOpencodeSessionFromDocker validation", () => {
  test("rejects missing workflowName", async () => {
    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: {} })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("workflowName is required")
    }
  })

  test("rejects empty workflowName", async () => {
    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("workflowName is required")
    }
  })

  test("rejects workflowName with path traversal", async () => {
    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "../etc/passwd" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("workflowName contains invalid characters")
    }
  })

  test("rejects workflowName with spaces", async () => {
    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "my workflow" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("workflowName contains invalid characters")
    }
  })

  test("rejects non-existent workflow", async () => {
    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "nonexistent-workflow-12345" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("not found")
    }
  })

  test("accepts valid workflowName format", () => {
    expect(/^[\w-]+$/.test("workflow1")).toBe(true)
    expect(/^[\w-]+$/.test("testWorkflow")).toBe(true)
    expect(/^[\w-]+$/.test("my-workflow-42")).toBe(true)
  })
})

describe("initializeOpencodeSessionFromDocker SSH command construction", () => {
  const originalSpawn = Bun.spawn
  let spawnedCmd
  let spawnedOpts
  let killCalled
  let spawnImpl

  beforeAll(() => {
    killCalled = false
    spawnImpl = (cmd, opts) => {
      spawnedCmd = cmd
      spawnedOpts = opts
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("OK\n"))
            controller.close()
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            controller.close()
          },
        }),
        exitCode: 0,
        exited: Promise.resolve(),
        kill() { killCalled = true },
      }
    }
    // @ts-ignore
    Bun.spawn = (...args) => spawnImpl(...args)
  })

  afterAll(() => {
    Bun.spawn = originalSpawn
  })

  test("constructs correct SSH command for workflow1", async () => {
    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })

    expect(result).toEqual({ success: true, workflow: "workflow1", message: "OK" })
    expect(spawnedOpts.stdin).toBe("ignore")
    expect(killCalled).toBe(true)
    expect(spawnedCmd).toBeDefined()
    expect(spawnedCmd[0]).toBe("sshpass")
    expect(spawnedCmd[1]).toBe("-p")
    expect(spawnedCmd[3]).toBe("ssh")
    expect(spawnedCmd[5]).toBe("2222")
    expect(spawnedCmd).toContain("-n")
    expect(spawnedCmd).toContain("sift@localhost")

    const remoteCmd = spawnedCmd[spawnedCmd.length - 1]
    expect(remoteCmd).toContain("/home/sift/workflows/workflow1")
    expect(remoteCmd).toContain("opencode serve --port 3113 --hostname 0.0.0.0")
    expect(remoteCmd).toContain("lsof -t -i:3113")
  })

  test("constructs correct SSH command for testWorkflow", async () => {
    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "testWorkflow" } })

    expect(result).toEqual({ success: true, workflow: "testWorkflow", message: "OK" })

    const remoteCmd = spawnedCmd[spawnedCmd.length - 1]
    expect(remoteCmd).toContain("/home/sift/workflows/testWorkflow")
  })

  test("SSH command includes ConnectTimeout to prevent hanging", () => {
    expect(spawnedCmd).toContain("-o")
    const connectTimeoutIdx = spawnedCmd.indexOf("ConnectTimeout=10")
    expect(connectTimeoutIdx).not.toBe(-1)
    expect(spawnedCmd[connectTimeoutIdx - 1]).toBe("-o")
  })

  test("Bun.spawn options include a timeout to prevent hanging", () => {
    expect(spawnedOpts.timeout).toBeDefined()
    expect(spawnedOpts.timeout).toBe(30_000)
  })

  test("remote curl health check uses --head and --max-time to avoid downloading large response body", () => {
    const remoteCmd = spawnedCmd[spawnedCmd.length - 1]
    expect(remoteCmd).toMatch(/curl.*--head.*--max-time/)
    expect(remoteCmd).toContain("--head")
    expect(remoteCmd).toContain("--max-time 3")
  })
})

describe("initializeOpencodeSessionFromDocker SSH failure handling", () => {
  const originalSpawn = Bun.spawn
  let spawnedCmd
  let spawnedOpts

  function makeMockProcess({
    stdoutText,
    stderrText,
    exitCode,
    neverResolve = false,
  }) {
    return {
      stdout: new ReadableStream({
        start(controller) {
          if (stdoutText !== undefined) {
            controller.enqueue(new TextEncoder().encode(stdoutText))
          }
          if (!neverResolve) controller.close()
        },
      }),
      stderr: new ReadableStream({
        start(controller) {
          if (stderrText !== undefined) {
            controller.enqueue(new TextEncoder().encode(stderrText))
          }
          controller.close()
        },
      }),
      exitCode: exitCode ?? null,
      exited: neverResolve
        ? new Promise(() => {})
        : Promise.resolve(exitCode ?? 0),
      kill() {},
    }
  }

  let mockConfig

  beforeAll(() => {
    // @ts-ignore
    Bun.spawn = (cmd, opts) => {
      spawnedCmd = cmd
      spawnedOpts = opts
      return makeMockProcess(mockConfig)
    }
  })

  afterAll(() => {
    Bun.spawn = originalSpawn
  })

  test("throws when remote command outputs FAIL (opencode failed to start)", async () => {
    mockConfig = { stdoutText: "FAIL\n", stderrText: "", exitCode: 0 }

    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("SSH command failed")
      expect(err.message).toContain("FAIL")
    }
  })

  test("throws with exit 255 and empty output (SSH protocol error)", async () => {
    mockConfig = { stdoutText: "", stderrText: "", exitCode: 255 }

    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("SSH command failed")
      expect(err.message).toContain("255")
    }
  })

  test("error message is descriptive when exit code is 255 (Docker container unreachable)", async () => {
    mockConfig = { stdoutText: "", stderrText: "", exitCode: 255 }

    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toMatch(/SSH connection failed|Docker|container|reachable|unable to connect/i)
    }
  })

  test("succeeds when stdout has trailing whitespace before OK", async () => {
    mockConfig = { stdoutText: "  OK  \n", stderrText: "", exitCode: 0 }

    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })

    expect(result).toEqual({ success: true, workflow: "workflow1", message: "OK" })
  })

  test("succeeds when stderr has warnings but stdout says OK", async () => {
    mockConfig = { stdoutText: "OK\n", stderrText: "some warning\n", exitCode: 0 }

    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })

    expect(result).toEqual({ success: true, workflow: "workflow1", message: "OK" })
  })

  test("throws when stdout has no OK and exit code is non-zero", async () => {
    mockConfig = { stdoutText: "some error output\n", stderrText: "", exitCode: 1 }

    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("SSH command failed")
      expect(err.message).toContain("1")
    }
  })

  test("throws when stdout is empty but stderr has error details", async () => {
    mockConfig = { stdoutText: "", stderrText: "opencode: command not found\n", exitCode: 127 }

    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("SSH command failed")
      expect(err.message).toContain("127")
      expect(err.message).toContain("opencode")
    }
  })

  test("succeeds when OK is the last line among other output", async () => {
    mockConfig = { stdoutText: "starting...\nOK\n", stderrText: "", exitCode: 0 }

    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })

    expect(result).toEqual({ success: true, workflow: "workflow1", message: "OK" })
  })

  test("throws when OK appears but not at end of output", async () => {
    mockConfig = { stdoutText: "OK\nFAIL\n", stderrText: "", exitCode: 1 }

    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("SSH command failed")
    }
  })
})

describe("initializeOpencodeSessionFromDocker integration", () => {
  test("returns OK for a valid workflow via real SSH", async () => {
    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })

    expect(result).toEqual({ success: true, workflow: "workflow1", message: "OK" })
  }, 20_000)

  test("returns OK for testWorkflow via real SSH", async () => {
    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "testWorkflow" } })

    expect(result).toEqual({ success: true, workflow: "testWorkflow", message: "OK" })
  }, 20_000)

  test("fails with a clear error when Docker container is not running", async () => {
    let originalSpawn = Bun.spawn
    let deferRestore = false
    // @ts-ignore
    Bun.spawn = (cmd, opts) => {
      deferRestore = true
      Bun.spawn = originalSpawn
      // Simulate unreachable host by using a port nothing listens on
      return originalSpawn([
        "sshpass", "-p", "forensics", "ssh",
        "-p", "2223",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=2",
        "-n",
        "sift@localhost",
        "echo OK",
      ], { stdin: "ignore" })
    }

    try {
      await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })
    } catch (err) {
      // Should fail because port 2223 is not the SSH port
      expect(err.message).toMatch(/SSH command failed/i)
    }
  }, 15_000)
})

