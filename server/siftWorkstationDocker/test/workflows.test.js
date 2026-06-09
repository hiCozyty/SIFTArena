import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { initializeOpencodeSessionFromDocker, verifyWorkflowMcpTool } from "../../ludus/workflows.js"

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
    expect(spawnedCmd[12]).toBe("sift@localhost")

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

describe("verifyWorkflowMcpTool validation", () => {
  test("rejects missing workflowName", async () => {
    try {
      await verifyWorkflowMcpTool(null, null, { data: {} })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("workflowName is required")
    }
  })

  test("rejects empty workflowName", async () => {
    try {
      await verifyWorkflowMcpTool(null, null, { data: { workflowName: "" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("workflowName is required")
    }
  })

  test("rejects workflowName with path traversal", async () => {
    try {
      await verifyWorkflowMcpTool(null, null, { data: { workflowName: "../etc/passwd" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("workflowName contains invalid characters")
    }
  })

  test("rejects non-existent workflow", async () => {
    try {
      await verifyWorkflowMcpTool(null, null, { data: { workflowName: "nonexistent-workflow-12345" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("not found")
    }
  })
})

describe("verifyWorkflowMcpTool SSH command and response parsing", () => {
  const originalSpawn = Bun.spawn
  let spawnedCmd

  afterAll(() => {
    Bun.spawn = originalSpawn
  })

  function mockSpawn(stdoutText, exitCode = 0, stderrText = "") {
    Bun.spawn = (cmd, opts) => {
      spawnedCmd = cmd
      return {
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(stdoutText))
            controller.close()
          },
        }),
        stderr: new ReadableStream({
          start(controller) {
            if (stderrText) controller.enqueue(new TextEncoder().encode(stderrText))
            controller.close()
          },
        }),
        exited: Promise.resolve(exitCode),
      }
    }
  }

  test("constructs correct SSH command for workflow1", async () => {
    mockSpawn(
      '{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"my_tool","description":"Does something useful","inputSchema":{"type":"object","properties":{"input":{"type":"string","description":"Some input value"}},"required":["input"]}}]}}\n{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"You passed: test-mcp"}]}}\n'
    )

    const result = await verifyWorkflowMcpTool(null, null, { data: { workflowName: "workflow1" } })

    expect(result).toEqual({ success: true, workflow: "workflow1", tool: "my_tool", result: "You passed: test-mcp" })
    expect(spawnedCmd).toBeDefined()
    expect(spawnedCmd[0]).toBe("sshpass")
    expect(spawnedCmd[3]).toBe("ssh")

    const remoteCmd = spawnedCmd[spawnedCmd.length - 1]
    expect(remoteCmd).toContain("cd /home/sift/workflows/workflow1")
    expect(remoteCmd).toContain("| timeout 10 bun run ./customMCP/index.ts 2>/dev/null")
    expect(remoteCmd).toContain('"method":"tools/list"')
    expect(remoteCmd).toContain('"method":"tools/call"')
    expect(remoteCmd).toContain('"input":"test-mcp"')
  })

  test("parses tool call result from stdout", async () => {
    mockSpawn(
      '{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"my_tool"}]}}\n{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"You passed: hello-world"}]}}\n'
    )

    const result = await verifyWorkflowMcpTool(null, null, { data: { workflowName: "workflow1" } })
    expect(result).toEqual({ success: true, workflow: "workflow1", tool: "my_tool", result: "You passed: hello-world" })
  })

  test("handles empty tool result gracefully", async () => {
    mockSpawn(
      '{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"my_tool"}]}}\n{"jsonrpc":"2.0","id":2,"result":{"content":[]}}\n'
    )

    const result = await verifyWorkflowMcpTool(null, null, { data: { workflowName: "workflow1" } })
    expect(result.result).toBe("")
  })

  test("throws on non-zero exit code", async () => {
    mockSpawn("", 1, "bun: command not found")

    try {
      await verifyWorkflowMcpTool(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("MCP tool verification failed")
      expect(err.message).toContain("bun: command not found")
    }
  })

  test("throws on JSON-RPC error in tools/call response", async () => {
    mockSpawn(
      '{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"my_tool"}]}}\n{"jsonrpc":"2.0","id":2,"error":{"code":-32603,"message":"Tool execution failed: Module not found"}}\n'
    )

    try {
      await verifyWorkflowMcpTool(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toContain("Tool call failed")
      expect(err.message).toContain("Module not found")
    }
  })

  test("throws when no tools/call response line is found", async () => {
    mockSpawn(
      '{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"my_tool"}]}}\n'
    )

    try {
      await verifyWorkflowMcpTool(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("No tools/call response received")
    }
  })

  test("throws on malformed JSON stdout", async () => {
    mockSpawn("not valid json\nstill not json\n")

    try {
      await verifyWorkflowMcpTool(null, null, { data: { workflowName: "workflow1" } })
      expect.unreachable("should have thrown")
    } catch (err) {
      expect(err.message).toBe("No tools/call response received")
    }
  })
})
