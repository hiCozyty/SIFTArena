import { Button } from "@/components/ui/button"
import { PromptSuggestions } from "@/components/ui/prompt-suggestions"
import { MessageList } from "@/components/ui/message-list"
import { InterruptPrompt } from "@/components/ui/interrupt-prompt"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useCallback, useState } from "react"
import { useAutoScroll } from "@/hooks/use-auto-scroll"
import type { Message } from "@/components/ui/chat-message"

interface ChatPanelProps {
  suggestions?: string[]
}

export function ChatPanel({
  suggestions = [
    "How do I use this technique?",
    "What are the prerequisites?",
    "Explain the command step by step",
    "What defenses exist against this?",
  ],
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [showInterruptPrompt, setShowInterruptPrompt] = useState(false)

  const { containerRef, scrollToBottom, handleScroll, shouldAutoScroll } = useAutoScroll([messages])

  const append = useCallback((message: { role: "user"; content: string }) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message.content,
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsGenerating(true)
    setShowInterruptPrompt(false)

    setTimeout(() => {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "This is a simulated response. Connect a backend API to get real answers.",
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsGenerating(false)
    }, 2000)
  }, [])

  const handleSubmit = useCallback((e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.()
    if (!input.trim()) return

    if (isGenerating) {
      if (showInterruptPrompt) {
        setIsGenerating(false)
        setShowInterruptPrompt(false)
      } else {
        setShowInterruptPrompt(true)
        return
      }
    }

    append({ role: "user", content: input.trim() })
    setInput("")
  }, [input, isGenerating, showInterruptPrompt, append])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
    },
    [],
  )

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-full flex-col p-4">
      {isEmpty ? (
        <PromptSuggestions
          label="Try these prompts"
          append={append}
          suggestions={suggestions}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto mb-4" ref={containerRef} onScroll={handleScroll}>
          <MessageList messages={messages} />
          {!shouldAutoScroll && (
            <Button
              onClick={scrollToBottom}
              className="sticky bottom-0 ml-auto h-8 w-8 rounded-full"
              size="icon"
              variant="ghost"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <div className="relative shrink-0">
        <InterruptPrompt isOpen={showInterruptPrompt} close={() => setShowInterruptPrompt(false)} />
        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Ask AI..."
          className="w-full resize-none rounded-xl border border-input bg-background p-3 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
          rows={3}
        />
        <Button
          onClick={handleSubmit}
          size="icon"
          className="absolute right-2 top-2 h-8 w-8"
          disabled={!input.trim()}
        >
          {isGenerating ? (
            <span className="h-3 w-3 animate-pulse rounded-full bg-current" />
          ) : (
            <ArrowUp className="h-5 w-5" />
          )}
        </Button>
      </div>

      {!isEmpty && (
        <div className="mt-3 flex flex-wrap gap-2 shrink-0">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => append({ role: "user", content: s })}
              className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
