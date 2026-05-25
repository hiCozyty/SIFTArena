export function TypingIndicator() {
  return (
    <div className="justify-left flex space-x-1">
      <div className="rounded-4xl bg-muted px-4 py-3">
        <div className="flex items-center space-x-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  )
}
