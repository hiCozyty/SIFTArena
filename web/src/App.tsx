import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { HomePage } from "@/pages/home"
import { SettingsPage } from "@/pages/settings"
import { EditApiKeyPage } from "@/pages/edit-api-key"
import { EditLudusApiPage } from "@/pages/edit-ludus-api"
import BottomDock from "@/components/dock"

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/edit-api-key" element={<EditApiKeyPage />} />
          <Route path="/edit-ludus-api-server" element={<EditLudusApiPage />} />
        </Routes>
        <BottomDock />
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
