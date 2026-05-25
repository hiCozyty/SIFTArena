import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/shared-ui-primitives/theme-provider"
import { AuthenticatedApp } from "@/components/app/authenticated-app"
import { PrototypeUI } from "@/pages/prototype-ui"
import { PreviewUI } from "@/pages/preview-ui"

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/prototypeui" element={<PrototypeUI />} />
          <Route path="/previewui" element={<PreviewUI />} />
          <Route path="/*" element={<AuthenticatedApp />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
