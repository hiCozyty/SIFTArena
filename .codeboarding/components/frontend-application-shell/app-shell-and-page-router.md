---
component_id: 5.6
component_name: App Shell & Page Router
---

# App Shell & Page Router

## Component Description

React entry point with BrowserRouter, route definitions (main app, prototype UI, preview UI), and top-level ThemeProvider wrapper. Provides the structural skeleton for the entire SPA.

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

### /home/cozyty/Projects/shadowProtocol/web/src/pages/prototype-ui.tsx (lines 1-14)
```
export function PrototypeUI() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Prototype.</strong> This page is for prototyping real feature usage. Components shown here import
        directly from <code>@/components/ui/</code>. To use a component
        elsewhere, import it from its source file — not from here.
      </div>

      <h1 className="font-heading text-2xl font-semibold tracking-tight">Prototype UI</h1>
      <p className="text-sm text-muted-foreground">Prototyping the real feature</p>
    </div>
  )
}
```


