import * as backendWs from "@/lib/backend-ws"

/**
 * Executes a WebSocket-based operation using a one-shot listener.
 *
 * Creates a temporary subscriber for the response message type, sends the
 * operation, and returns a promise that resolves/rejects when the backend responds.
 *
 * @example
 * // Basic usage: delete a deployed VM
 * setDeletingVm(true)
 * try {
 *   const result = await executeWsOperation<{ deleted: string }>({
 *     messageType: "deleteVM",
 *     sendFn: () => backendWs.send({ type: "deleteVM", vm: "ty-win11-22h2-test" }),
 *     ensurePaint: true,
 *   })
 *   * } catch (err) {
 *   console.error("Delete failed:", err.message)
 * } finally {
 *   setDeletingVm(false)
 * }
 *
 * @example
 * // Power on/off a VM (future use)
 * setPoweringVm(true)
 * try {
 *   const result = await executeWsOperation<{ poweredOn: string }>({
 *     messageType: "powerOnVM",
 *     sendFn: () => backendWs.send({ type: "powerOnVM", vm: hostname }),
 *     ensurePaint: true,
 *   })
 * } finally {
 *   setPoweringVm(false)
 * }
 *
 * @example
 * // Without spinner (fast operations where you don't need UI feedback)
 * const result = await executeWsOperation({
 *   messageType: "someFastOp",
 *   sendFn: () => backendWs.send({ type: "someFastOp" }),
 * })
 */
export async function executeWsOperation<T = unknown>(opts: {
  /** The WebSocket message type to listen for (e.g. "deleteVM", "powerOnVM") */
  messageType: string
  /** Function that sends the operation message via backendWs.send() */
  sendFn: () => void
  /**
   * When true, yields one animation frame before sending the message.
   * This guarantees React paints any loading spinner before the operation starts.
   * Use this when the operation takes several seconds and you want the user
   * to see a loading state immediately.
   *
   * Default: false
   */
  ensurePaint?: boolean
}): Promise<T> {
  if (opts.ensurePaint) {
    await new Promise((r) => requestAnimationFrame(r))
  }

  return new Promise((resolve, reject) => {
    const unsub = backendWs.subscribe((data) => {
      if (data.type !== opts.messageType) return
      unsub()
      if (data.error) {
        reject(new Error(data.error as string))
      } else {
        resolve(data.result as T)
      }
    })
    opts.sendFn()
    })
}
