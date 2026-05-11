import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthenticatedApp } from "@/components/authenticated-app"
import { PreviewUiPage } from "@/pages/preview-ui"

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/previewui" element={<PreviewUiPage />} />
          <Route path="/*" element={<AuthenticatedApp />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
