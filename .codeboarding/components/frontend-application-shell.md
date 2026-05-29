---
component_id: 4
component_name: Frontend Application Shell
---

# Frontend Application Shell

## Component Description

Top-level React application structure providing page routing, theme management, dock navigation, and the reusable UI component library (shadcn primitives). Renders the layout container that hosts all feature-specific pages and components.

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

### /home/cozyty/Projects/shadowProtocol/web/src/components/app/dock.tsx (lines 15-30)
```
export default function BottomDock() {
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isDark = theme === "dark"

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <AppleDock
          direction="middle"
          className="border-border/20 bg-background/60 backdrop-blur-xl"
        >
          <AppleDockIcon
            className="bg-transparent text-primary"
            onClick={() => setSettingsOpen(false)}
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

### /home/cozyty/Projects/shadowProtocol/web/src/components/kibo-ui/code-block/index.tsx (lines 479-526)
```
export const CodeBlockCopyButton = ({
  asChild,
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { data, value } = useContext(CodeBlockContext);
  const code = data.find((item) => item.language === value)?.code;

  const copyToClipboard = () => {
    if (
      typeof window === "undefined" ||
      !navigator.clipboard.writeText ||
      !code
    ) {
      return;
    }

    navigator.clipboard.writeText(code).then(() => {
      setIsCopied(true);
      onCopy?.();

      setTimeout(() => setIsCopied(false), timeout);
    }, onError);
  };

  if (asChild) {
    return cloneElement(children as ReactElement, {
      // @ts-expect-error - we know this is a button
      onClick: copyToClipboard,
    });
  }

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon className="text-muted-foreground" size={14} />}
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/ui/chat.tsx (lines 235-235)
```
Chat.displayName = "Chat"
```


## Source Files:

- `web/src/App.tsx`
- `web/src/components/kibo-ui/tree/index.tsx`
- `web/src/components/ui/avatar.tsx`
- `web/src/components/ui/button-group.tsx`
- `web/src/components/ui/carousel.tsx`
- `web/src/components/ui/empty.tsx`
- `web/src/components/ui/item.tsx`
- `web/src/components/ui/message-input.tsx`
- `web/src/components/ui/message-list.tsx`
- `web/src/components/ui/native-select.tsx`
- `web/src/components/ui/navigation-menu.tsx`
- `web/src/components/ui/prompt-suggestions.tsx`
- `web/src/components/ui/resizable.tsx`
- `web/src/components/ui/separator.tsx`
- `web/src/pages/prototype-ui.tsx`

