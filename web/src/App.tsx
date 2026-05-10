import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home"
import { PreviewUiPage } from "@/pages/preview-ui"

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/previewui" element={<PreviewUiPage />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
