import { useState } from "react"
import { cn } from "@/lib/utils"

export interface QuestionOption {
  label: string
  description: string
}

export interface QuestionData {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
}

export interface QuestionToolRendererProps {
  questions: QuestionData[]
  onAnswer: (answers: Record<number, string>) => void
}

export function QuestionToolRenderer({ questions, onAnswer }: QuestionToolRendererProps) {
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
    if (Object.keys(answers).length > 0) {
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
              >
                <div className="mt-0.5">
                  {q.multiple ? (
                    <div className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center",
                      selections[qIndex]?.has(opt.label) ? "border-primary bg-primary" : "border-border"
                    )}>
                      {selections[qIndex]?.has(opt.label) && (
                        <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  ) : (
                    <div className={cn(
                      "h-4 w-4 rounded-full border flex items-center justify-center",
                      selections[qIndex]?.has(opt.label) ? "border-primary" : "border-border"
                    )}>
                      {selections[qIndex]?.has(opt.label) && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium">{opt.label}</span>
                  {opt.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="mt-2">
              <input
                type="text"
                placeholder="Type your own answer..."
                onFocus={() => setSelections((prev) => ({ ...prev, [qIndex]: new Set() }))}
                value={customAnswers[qIndex] || ""}
                onChange={(e) =>
                  setCustomAnswers((prev) => ({
                    ...prev,
                    [qIndex]: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
              />
            </div>
          </div>
        </div>
      ))}
      {!submitted && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!isAnswered}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            Submit Answer
          </button>
        </div>
      )}
      {submitted && (
        <div className="mt-2 text-xs text-muted-foreground text-center">
          Answer submitted
        </div>
      )}
    </div>
  )
}
