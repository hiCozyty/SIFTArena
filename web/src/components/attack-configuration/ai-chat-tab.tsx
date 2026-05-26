import { Button } from "@/components/ui/button"
import { MessageList } from "@/components/ui/message-list"
import { InterruptPrompt } from "@/components/ui/interrupt-prompt"
import { ArrowDown, ArrowUp, Square } from "lucide-react"
import { useCallback, useState } from "react"
import { useAutoScroll } from "@/hooks/use-auto-scroll"
import { useOpencodeChat } from "@/hooks/use-opencode-chat"

export function AiChatTab() {
  const { messages, isGenerating, isToolExecuting, error, sendMessage, stopGenerating } = useOpencodeChat()
  const [input, setInput] = useState("")
  const [showInterruptPrompt, setShowInterruptPrompt] = useState(false)

  const lastMsg = messages[messages.length - 1]
  const autoScrollDeps = [messages.length, isGenerating, lastMsg?.content]
  const { containerRef, scrollToBottom, handleScroll, shouldAutoScroll, resetAutoScroll } = useAutoScroll(autoScrollDeps)

  const handleSubmit = useCallback((e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.()

    if (isGenerating) {
      if (showInterruptPrompt) {
        setShowInterruptPrompt(false)
        stopGenerating()
        scrollToBottom()
      } else {
        setShowInterruptPrompt(true)
        return
      }
    }

    if (!input.trim()) return

    resetAutoScroll()
    sendMessage(input.trim())
    setInput("")
  }, [input, isGenerating, showInterruptPrompt, sendMessage, resetAutoScroll, stopGenerating, scrollToBottom])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
    },
    [],
  )

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="mb-2 rounded-4xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive mx-4 mt-4">
          {error}
        </div>
      )}
      <div className="flex-1 min-h-0 relative">
        <div className="h-full overflow-y-auto px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={containerRef} onScroll={handleScroll}>
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Button onClick={() => sendMessage("create an existing ability variant")}>
                Create an existing ability variant
              </Button>
              <Button onClick={() => sendMessage("create a new ability")}>
                Create a new ability
              </Button>
            </div>
          ) : (
            <MessageList messages={messages} isTyping={isGenerating} />
          )}
        </div>
        {!shouldAutoScroll && !isEmpty && (
          <Button
            onClick={scrollToBottom}
            className="absolute bottom-2 right-6 h-8 w-8 rounded-full"
            size="icon"
            variant="ghost"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="shrink-0 p-4">
        <InterruptPrompt isOpen={showInterruptPrompt} close={() => setShowInterruptPrompt(false)} />
        <div className="relative">
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
            className="w-full resize-none rounded-4xl border border-input bg-background p-3 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
            rows={3}
          />
          <Button
            onClick={handleSubmit}
            size="icon"
            className="absolute right-2 top-2 h-8 w-8"
            disabled={(!input.trim() && !isGenerating) || isToolExecuting}
          >
            {isGenerating ? (
              <Square className="h-4 w-4" />
            ) : (
              <ArrowUp className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
