---
component_id: 5.8
component_name: Chat & Message Infrastructure
---

# Chat & Message Infrastructure

## Component Description

Reusable chat widget system — renders AI messages with syntax-highlighted Markdown, tool calls, reasoning blocks, and file attachments. Provides voice-enabled text input with file upload and interactive question/answer rendering.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/web/src/components/ui/chat-message.tsx (lines 149-200)
```
export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  createdAt,
  showTimeStamp = false,
  animation = "scale",
  actions,
  experimental_attachments,
  toolInvocations,
  parts,
  onAnswerQuestion,
}) => {
  const files = useMemo(() => {
    return experimental_attachments?.map((attachment) => {
      const dataArray = dataUrlToUint8Array(attachment.url)
      const file = new File([dataArray], attachment.name ?? "Unknown", {
        type: attachment.contentType,
      })
      return file
    })
  }, [experimental_attachments])

  const isUser = role === "user"

  const formattedTime = createdAt?.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })

  if (isUser) {
    return (
      <div
        className={cn("flex flex-col", isUser ? "items-end" : "items-start")}
      >
        {files ? (
          <div className="mb-1 flex flex-wrap gap-2">
            {files.map((file, index) => {
              return <FilePreview file={file} key={index} />
            })}
          </div>
        ) : null}

        <div className={cn(chatBubbleVariants({ isUser, animation }))}>
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>

        {showTimeStamp && createdAt && isUser ? (
          <time
            dateTime={createdAt.toISOString()}
            className={cn(
              "mt-1 block px-1 text-xs opacity-50",
              animation !== "none" && "duration-500 animate-in fade-in-0"
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/ui/message-input.tsx (lines 309-309)
```
MessageInput.displayName = "MessageInput"
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/ui/markdown-renderer.tsx (lines 12-20)
```
export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <div className="space-y-3">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </Markdown>
    </div>
  )
}
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/ui/question-tool-renderer.tsx (lines 21-87)
```
export function QuestionToolRenderer({ questions, onAnswer }: QuestionToolRendererProps) {
  console.log("[QuestionToolRenderer] mounted with questions:", questions)
  const [selections, setSelections] = useState<Record<number, Set<string>>>({})
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({})
  const [submitted, setSubmitted] = useState(false)

  const toggleOption = (questionIndex: number, optionLabel: string) => {
    setSelections((prev) => {
      const current = prev[questionIndex] || new Set()
      const next = new Set(current)
      if (next.has(optionLabel)) {
        next.delete(optionLabel)
      } else {
        const question = questions[questionIndex]
        if (!question.multiple) {
          next.clear()
        }
        next.add(optionLabel)
      }
      return { ...prev, [questionIndex]: next }
    })
  }

  const handleSubmit = () => {
    const answers: Record<number, string> = {}
    questions.forEach((q, i) => {
      const selected = Array.from(selections[i] || [])
      const custom = customAnswers[i]?.trim()
      if (custom) {
        answers[i] = custom
      } else if (selected.length > 0) {
        answers[i] = selected.join(", ")
      }
    })
    console.log("[QuestionToolRenderer] submit clicked, answers:", answers)
    if (Object.keys(answers).length > 0) {
      console.log("[QuestionToolRenderer] calling onAnswer with:", answers)
      onAnswer(answers)
      setSubmitted(true)
    }
  }

  const isAnswered = Object.keys(selections).some(
    (i) => (selections[parseInt(i)]?.size || 0) > 0
  ) || Object.values(customAnswers).some((v) => v.trim().length > 0)

  return (
    <div className="w-full sm:max-w-[70%] rounded-4xl border bg-muted/50 p-3">
      {questions.map((q, qIndex) => (
        <div key={qIndex} className={qIndex > 0 ? "mt-3 pt-3 border-t" : ""}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {q.header}
            </span>
          </div>
          <p className="text-sm font-medium mb-2">{q.question}</p>
          <div className="space-y-1.5">
            {q.options.map((opt, optIndex) => (
              <div
                key={optIndex}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors",
                  selections[qIndex]?.has(opt.label)
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted"
                )}
                onClick={() => toggleOption(qIndex, opt.label)}
```


