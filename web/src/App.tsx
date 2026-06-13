import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ThemeProvider } from "@/components/shared-ui-primitives/theme-provider"
import { AuthenticatedApp } from "@/components/app/authenticated-app"
import { PrototypeUI } from "@/pages/prototype-ui"
import { PrototypeUI2 } from "@/pages/prototype-ui2"
import { PrototypeUI3 } from "@/pages/prototype-ui3"
import { PrototypeUI4 } from "@/pages/prototype-ui4"
import { PrototypeUI5 } from "@/pages/prototype-ui5"
import { PreviewUI } from "@/pages/preview-ui"

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/prototypeui" element={<PrototypeUI />} />
          <Route path="/prototypeui2" element={<PrototypeUI2 />} />
          <Route path="/prototypeui3" element={<PrototypeUI3 />} />
          <Route path="/prototypeui4" element={<PrototypeUI4 />} />
          <Route path="/prototypeui5" element={<PrototypeUI5 />} />
          <Route path="/previewui" element={<PreviewUI />} />
          <Route path="/*" element={<AuthenticatedApp />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
