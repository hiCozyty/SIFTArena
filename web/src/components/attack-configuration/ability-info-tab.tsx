import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"

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
    kaliPrereq: string
    winPrereq: string
  } | null
  mode: "read" | "write"
}

export function AbilityInfoTab({ content, mode }: AbilityInfoTabProps) {
  if (mode === "write") {
    return (
      <div className="flex h-full flex-col gap-4 p-4 text-sm overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div>
          <label className="font-bold text-sm">Name</label>
          <Input className="mt-1 font-mono" placeholder="Ability name" />
        </div>
        <div>
          <label className="font-bold text-sm">Description</label>
          <textarea className="mt-1 font-mono w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" placeholder="Description" rows={3} />
        </div>
        <div>
          <label className="font-bold text-sm">Command</label>
          <textarea className="mt-1 font-mono w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" placeholder="Command" rows={3} />
        </div>
        <div className="border-t pt-4">
          <label className="font-bold text-sm">Kali Prerequisites</label>
          <textarea className="mt-1 font-mono w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" placeholder="(none)" rows={3} />
        </div>
        <div className="pt-2">
          <label className="font-bold text-sm">Windows Prerequisites</label>
          <textarea className="mt-1 font-mono w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm" placeholder="(none)" rows={3} />
        </div>
      </div>
    )
  }

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
      {content.kaliPrereq ? (
        <div className="mt-6 border-t pt-4">
          <div className="mb-2 font-bold">Kali Prerequisites</div>
          <CopyCommandBlock commands={content.kaliPrereq} />
        </div>
      ) : (
        <div className="mt-6 border-t pt-4 text-muted-foreground">
          <span className="font-bold">Kali Prerequisites:</span> (none)
        </div>
      )}
      {content.winPrereq ? (
        <div className="mt-4 pt-2">
          <div className="mb-2 font-bold">Windows Prerequisites</div>
          <CopyCommandBlock commands={content.winPrereq} />
        </div>
      ) : (
        <div className="mt-4 pt-2 text-muted-foreground">
          <span className="font-bold">Windows Prerequisites:</span> (none)
        </div>
      )}
    </div>
  )
}
