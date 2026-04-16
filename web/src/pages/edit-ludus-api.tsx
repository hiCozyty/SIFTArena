import { useNavigate } from "react-router-dom"
import { LudusApiCard, getLudusApiConfig } from "@/components/ludus-api-card"

export function EditLudusApiPage() {
  const navigate = useNavigate()
  const currentConfig = getLudusApiConfig() || {
    ip: "",
    port: "8080",
    apiKey: "",
  }

  return (
    <div className="select-none">
      <LudusApiCard
        currentConfig={currentConfig}
        onSave={() => navigate("/settings")}
      />
    </div>
  )
}
