import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { initializeOpencodeSessionFromDocker } from "../../ludus/workflows.js"

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

  beforeAll(() => {
    // @ts-ignore
    Bun.spawn = (cmd, opts) => {
      spawnedCmd = cmd
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
        exited: Promise.resolve(0),
      }
    }
  })

  afterAll(() => {
    Bun.spawn = originalSpawn
  })

  test("constructs correct SSH command for workflow1", async () => {
    const result = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName: "workflow1" } })

    expect(result).toEqual({ success: true, workflow: "workflow1", message: "OK" })
    expect(spawnedCmd).toBeDefined()
    expect(spawnedCmd[0]).toBe("sshpass")
    expect(spawnedCmd[1]).toBe("-p")
    expect(spawnedCmd[3]).toBe("ssh")
    expect(spawnedCmd[5]).toBe("2222")
    expect(spawnedCmd[10]).toBe("sift@localhost")

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
})

