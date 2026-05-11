import { useState, useEffect, useRef, useCallback } from "react"
import * as backendWs from "@/lib/backend-ws"

const P = "[hc]"

export type HealthCheckStatus =
  | { type: "idle" }
  | { type: "connecting" }
  | { type: "connection-error" }
  | { type: "health-error"; rawStatus: string; detail?: string; config?: { ludusUrl?: string } }
  | { type: "ok" }

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8011"
const MIN_CONNECTING_MS = 300
const TIMEOUT_MS = 5000

export function useHealthCheck() {
  const [status, setStatus] = useState<HealthCheckStatus>({ type: "idle" })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const delayedRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const connectStartRef = useRef(0)
  const resolvedRef = useRef(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const connect = useCallback(() => {
    console.log(P, `connect() called — current status=${status.type}`)
    clearTimeout(delayedRef.current)
    clearTimeout(timeoutRef.current)

    unsubscribeRef.current?.()
    backendWs.close()

    resolvedRef.current = false
    connectStartRef.current = Date.now()
    setStatus({ type: "connecting" })

    const scheduleTransition = (toStatus: HealthCheckStatus) => {
      const doTransition = () => {
        if (resolvedRef.current) return
        console.log(P, `transition: connecting -> ${toStatus.type}`)
        setStatus((prev) => (prev.type === "connecting" ? toStatus : prev))
      }
      const elapsed = Date.now() - connectStartRef.current
      if (elapsed >= MIN_CONNECTING_MS) {
        doTransition()
      } else {
        delayedRef.current = setTimeout(doTransition, MIN_CONNECTING_MS - elapsed)
      }
    }

    timeoutRef.current = setTimeout(() => {
      if (resolvedRef.current) return
      console.log(P, `timeout reached (${TIMEOUT_MS}ms) — closing ws`)
      backendWs.close()
      scheduleTransition({ type: "connection-error" })
    }, TIMEOUT_MS)

    backendWs.connect(WS_URL, () => {
      if (resolvedRef.current) return
      console.log(P, `ws onClose callback — scheduling connection-error`)
      clearTimeout(timeoutRef.current)
      clearTimeout(delayedRef.current)
      scheduleTransition({ type: "connection-error" })
    })
    backendWs.send({ type: "healthCheck" })

    unsubscribeRef.current = backendWs.subscribe((data: Record<string, unknown>) => {
      if (data.type !== "healthCheck") return
      clearTimeout(timeoutRef.current)

      const result = data.result as Record<string, unknown> | undefined
      console.log(P, `healthCheck response received`, result)
      if (result?.status === "ok") {
        resolvedRef.current = true
        clearTimeout(delayedRef.current)
        console.log(P, `healthCheck OK — transitioning to "ok"`)
        setStatus({ type: "ok" })
      } else {
        console.log(P, `healthCheck NOT ok — status=${result?.status}`)
        scheduleTransition({
          type: "health-error",
          rawStatus: (result?.status as string) || "unknown",
          detail: result?.error as string | undefined,
          config: result?.config as { ludusUrl?: string } | undefined,
        })
      }
    })
  }, [])

  useEffect(() => {
    return () => {
      console.log(P, `cleanup — unmounting, clearing timers and closing ws`)
      clearTimeout(timeoutRef.current)
      clearTimeout(delayedRef.current)
      unsubscribeRef.current?.()
      backendWs.close()
    }
  }, [])

  return { status, connect }
}
