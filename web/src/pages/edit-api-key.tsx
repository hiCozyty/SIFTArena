import { useNavigate } from "react-router-dom"
import { ApiKeyCard, getApiKey } from "@/components/api-key-card"

export function EditApiKeyPage() {
  const navigate = useNavigate()
  const currentKey = getApiKey()

  return (
    <div className="select-none">
      <ApiKeyCard
        currentKey={currentKey || ""}
        onSave={() => navigate("/settings")}
      />
    </div>
  )
}
