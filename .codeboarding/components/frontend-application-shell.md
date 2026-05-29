---
component_id: 5
component_name: Frontend Application Shell
---

# Frontend Application Shell

## Component Description

Provides the React SPA skeleton — page routing, all shadcn/ui design system components, theme management, WebSocket client library, and browser utility hooks (audio capture, clipboard). Every feature workspace mounts inside this shell.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/web/src/App.tsx (lines 7-12)
```
function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/prototypeui" element={<PrototypeUI />} />
```

### /home/cozyty/Projects/shadowProtocol/web/src/lib/backend-ws.ts (lines 10-39)
```
export function connect(url: string, onClose?: () => void) {
  if (ws && state !== "disconnected") return
  reconnectUrl = url
  reconnectOnClose = onClose ?? null
  state = "connecting"
  ws = new WebSocket(url)
  ws.onopen = () => {
    state = "connected"
    for (const msg of sendQueue) {
      ws?.send(msg)
    }
    sendQueue = []
  }
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      for (const handler of handlers) {
        handler(data)
      }
    } catch {
      // ignore parse errors
    }
  }
  ws.onclose = () => {
    state = "disconnected"
    ws = null
    sendQueue = []
    onClose?.()
  }
}
```

### /home/cozyty/Projects/shadowProtocol/web/src/lib/backend-ws.ts (lines 53-63)
```
export function send(msg: Record<string, unknown>) {
  const payload = JSON.stringify(msg)
  if (state === "connected") {
    ws?.send(payload)
  } else {
    sendQueue.push(payload)
    if (state === "disconnected" && reconnectUrl) {
      connect(reconnectUrl, reconnectOnClose ?? undefined)
    }
  }
}
```

### /home/cozyty/Projects/shadowProtocol/web/src/lib/backend-ws.ts (lines 65-70)
```
export function subscribe(handler: (data: Record<string, unknown>) => void): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/shared-ui-primitives/theme-provider.tsx (lines 56-156)
```
export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey)
    if (isTheme(storedTheme)) {
      return storedTheme
    }

    return defaultTheme
  })

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  const applyTheme = React.useCallback(
    (nextTheme: Theme) => {
      const root = document.documentElement
      const resolvedTheme =
        nextTheme === "system" ? getSystemTheme() : nextTheme
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null

      root.classList.remove("light", "dark")
      root.classList.add(resolvedTheme)

      if (restoreTransitions) {
        restoreTransitions()
      }
    },
    [disableTransitionOnChange]
  )

  React.useEffect(() => {
    applyTheme(theme)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => {
      applyTheme("system")
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [theme, applyTheme])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) {
        return
      }

      if (event.key !== storageKey) {
        return
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue)
        return
      }

      setThemeState(defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [theme, setTheme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
```

### /home/cozyty/Projects/shadowProtocol/web/src/hooks/use-audio-recording.ts (lines 10-93)
```
export function useAudioRecording({
  transcribeAudio,
  onTranscriptionComplete,
}: UseAudioRecordingOptions) {
  const [isListening, setIsListening] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(!!transcribeAudio)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null)
  const activeRecordingRef = useRef<any>(null)

  useEffect(() => {
    const checkSpeechSupport = async () => {
      const hasMediaDevices = !!(
        navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      )
      setIsSpeechSupported(hasMediaDevices && !!transcribeAudio)
    }

    checkSpeechSupport()
  }, [transcribeAudio])

  const stopRecording = async () => {
    setIsRecording(false)
    setIsTranscribing(true)
    try {
      // First stop the recording to get the final blob
      recordAudio.stop()
      // Wait for the recording promise to resolve with the final blob
      const recording = await activeRecordingRef.current
      if (transcribeAudio) {
        const text = await transcribeAudio(recording)
        onTranscriptionComplete?.(text)
      }
    } catch (error) {
      console.error("Error transcribing audio:", error)
    } finally {
      setIsTranscribing(false)
      setIsListening(false)
      if (audioStream) {
        audioStream.getTracks().forEach((track) => track.stop())
        setAudioStream(null)
      }
      activeRecordingRef.current = null
    }
  }

  const toggleListening = async () => {
    if (!isListening) {
      try {
        setIsListening(true)
        setIsRecording(true)
        // Get audio stream first
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        setAudioStream(stream)

        // Start recording with the stream
        activeRecordingRef.current = recordAudio(stream)
      } catch (error) {
        console.error("Error recording audio:", error)
        setIsListening(false)
        setIsRecording(false)
        if (audioStream) {
          audioStream.getTracks().forEach((track) => track.stop())
          setAudioStream(null)
        }
      }
    } else {
      await stopRecording()
    }
  }

  return {
    isListening,
    isSpeechSupported,
    isRecording,
    isTranscribing,
    audioStream,
    toggleListening,
    stopRecording,
  }
}
```


## Source Files:

- `web/src/App.tsx`
- `web/src/components/app/dock.tsx`
- `web/src/components/app/landing-tabs.tsx`
- `web/src/components/attack-configuration/ai-chat-tab.tsx`
- `web/src/components/attack-configuration/attack-configuration.tsx`
- `web/src/components/attack-configuration/technique-tree.tsx`
- `web/src/components/icons/caldera-icon.tsx`
- `web/src/components/icons/game-icons-mesh-network.tsx`
- `web/src/components/icons/sift-agent-icon.tsx`
- `web/src/components/icons/tabler-brand-speedtest.tsx`
- `web/src/components/kibo-ui/code-block/index.tsx`
- `web/src/components/kibo-ui/tree/index.tsx`
- `web/src/components/knowledge-graph/knowledge-graph-content.tsx`
- `web/src/components/lab-range/backend-gate.tsx`
- `web/src/components/lab-range/lab-range-content.tsx`
- `web/src/components/lab-range/ludus-server-guide.tsx`
- `web/src/components/lab-range/use-deployment-pipeline.ts`
- `web/src/components/lab-range/use-lab-range-state.ts`
- `web/src/components/lab-range/use-template-builder.ts`
- `web/src/components/lab-range/vm-topology.tsx`
- `web/src/components/lab-range/yaml-topology-gui.tsx`
- `web/src/components/leaderboard/leaderboard-content.tsx`
- `web/src/components/run-benchmark/benchmark-content.tsx`
- `web/src/components/shadcn-space/apple-dock/apple-dock-01.tsx`
- `web/src/components/shared-ui-primitives/tab-content-card.tsx`
- `web/src/components/shared-ui-primitives/theme-provider.tsx`
- `web/src/components/sift-agent/sift-agent-content.tsx`
- `web/src/components/snr/snr-content.tsx`
- `web/src/components/ui/alert-dialog.tsx`
- `web/src/components/ui/alert.tsx`
- `web/src/components/ui/audio-visualizer.tsx`
- `web/src/components/ui/avatar.tsx`
- `web/src/components/ui/badge.tsx`
- `web/src/components/ui/breadcrumb.tsx`
- `web/src/components/ui/button-group.tsx`
- `web/src/components/ui/button.tsx`
- `web/src/components/ui/card.tsx`
- `web/src/components/ui/carousel.tsx`
- `web/src/components/ui/chat-message.tsx`
- `web/src/components/ui/chat.tsx`
- `web/src/components/ui/collapsible.tsx`
- `web/src/components/ui/command.tsx`
- `web/src/components/ui/copy-button.tsx`
- `web/src/components/ui/dialog.tsx`
- `web/src/components/ui/dropdown-menu.tsx`
- `web/src/components/ui/empty.tsx`
- `web/src/components/ui/file-preview.tsx`
- `web/src/components/ui/input.tsx`
- `web/src/components/ui/interrupt-prompt.tsx`
- `web/src/components/ui/item.tsx`
- `web/src/components/ui/label.tsx`
- `web/src/components/ui/markdown-renderer.tsx`
- `web/src/components/ui/menubar.tsx`
- `web/src/components/ui/message-input.tsx`
- `web/src/components/ui/message-list.tsx`
- `web/src/components/ui/native-select.tsx`
- `web/src/components/ui/navigation-menu.tsx`
- `web/src/components/ui/progress.tsx`
- `web/src/components/ui/prompt-suggestions.tsx`
- `web/src/components/ui/question-tool-renderer.tsx`
- `web/src/components/ui/resizable.tsx`
- `web/src/components/ui/select.tsx`
- `web/src/components/ui/separator.tsx`
- `web/src/components/ui/sheet.tsx`
- `web/src/components/ui/spinner.tsx`
- `web/src/components/ui/switch.tsx`
- `web/src/components/ui/table.tsx`
- `web/src/components/ui/tabs-fancy.tsx`
- `web/src/components/ui/tabs.tsx`
- `web/src/components/ui/tooltip.tsx`
- `web/src/hooks/use-audio-recording.ts`
- `web/src/hooks/use-auto-scroll.ts`
- `web/src/hooks/use-autosize-textarea.ts`
- `web/src/hooks/use-copy-to-clipboard.ts`
- `web/src/hooks/use-focused-data.ts`
- `web/src/hooks/use-health-check.ts`
- `web/src/hooks/use-opencode-chat.ts`
- `web/src/lib/audio-utils.ts`
- `web/src/lib/backend-ws.ts`
- `web/src/lib/range-yaml-validator.ts`
- `web/src/lib/utils.ts`
- `web/src/pages/preview-ui.tsx`
- `web/src/pages/prototype-ui.tsx`
- `web/src/pages/settings.tsx`

