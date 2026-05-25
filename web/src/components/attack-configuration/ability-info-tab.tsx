import { Check, Copy } from "lucide-react"
import { useState } from "react"

function CopyCommandBlock({ commands }: { commands: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(commands)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-background/50 rounded-4xl overflow-hidden">
      <div className="flex justify-end px-3 py-1.5">
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="p-3 pt-0 text-xs overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <code>{commands}</code>
      </pre>
    </div>
  )
}

export interface AbilityInfoTabProps {
  content: {
    name: string
    abilityId: string
    description: string
    command: string
    downloadInstructions: string
  } | null
}

export function AbilityInfoTab({ content }: AbilityInfoTabProps) {
  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center p-4 font-mono text-sm text-muted-foreground">
        Please select an ability.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-4 font-mono text-sm overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mb-4">
        <span className="font-bold">Name:</span> {content.name}
      </div>
      {content.abilityId && (
        <div className="mb-4">
          <span className="font-bold">Ability ID:</span> {content.abilityId}
        </div>
      )}
      <div className="mb-4">
        <span className="font-bold">Description:</span> {content.description}
      </div>
      <div className="mb-4">
        <span className="font-bold">Command:</span> {content.command}
      </div>
      {content.downloadInstructions && (
        <div className="mt-6 border-t pt-4">
          {(() => {
            const lines = content.downloadInstructions.split("\n")
            const titleIndex = lines.findIndex(l => l.includes("Prerequisites (Manual Step Required)"))
            const payloadIndex = lines.findIndex(l => l.startsWith("Payload:"))

            const warningLines = lines.slice(titleIndex + 1, payloadIndex >= 0 ? payloadIndex : undefined).join("\n").trim()
            const payloadLine = payloadIndex >= 0 ? lines[payloadIndex] : ""
            const commands = payloadIndex >= 0 ? lines.slice(payloadIndex + 1).join("\n").trim() : ""

            return (
              <>
                <div className="mb-2 font-bold">Prerequisites (Manual Step Required)</div>
                <p className="mb-3 text-muted-foreground whitespace-pre-wrap">{warningLines}</p>
                {payloadLine && <p className="mb-2 font-medium">{payloadLine}</p>}
                {commands && (
                  <div className="relative mt-3">
                    <CopyCommandBlock commands={commands} />
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
