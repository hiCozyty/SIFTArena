---
component_id: 7.10
component_name: Backend Health Monitor
---

# Backend Health Monitor

## Component Description

useHealthCheck hook — monitors WebSocket connectivity to the Bun BFF server and Ludus server health, driving the backend gate UI that blocks range operations when the server is unreachable.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/web/src/hooks/use-health-check.ts (lines 15-91)
```
export function useHealthCheck() {
  const [status, setStatus] = useState<HealthCheckStatus>({ type: "idle" })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const delayedRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const connectStartRef = useRef(0)
  const resolvedRef = useRef(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const connect = useCallback(() => {
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
      backendWs.close()
      scheduleTransition({ type: "connection-error" })
    }, TIMEOUT_MS)

    backendWs.connect(WS_URL, () => {
      if (resolvedRef.current) return
      clearTimeout(timeoutRef.current)
      clearTimeout(delayedRef.current)
      scheduleTransition({ type: "connection-error" })
    })
    backendWs.send({ type: "healthCheck" })

    unsubscribeRef.current = backendWs.subscribe((data: Record<string, unknown>) => {
      if (data.type !== "healthCheck") return
      clearTimeout(timeoutRef.current)

      const result = data.result as Record<string, unknown> | undefined
      if (result?.status === "ok") {
        resolvedRef.current = true
        clearTimeout(delayedRef.current)
        setStatus({ type: "ok" })
      } else {
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
      clearTimeout(timeoutRef.current)
      clearTimeout(delayedRef.current)
      unsubscribeRef.current?.()
      backendWs.close()
    }
  }, [])

  return { status, connect }
}
```


## Source Files:

- `web/src/hooks/use-health-check.ts`

