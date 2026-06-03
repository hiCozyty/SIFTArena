export type SelectedTemplateFile = {
  templateName: string
  fileName: string
  content: string
} | null

interface TemplateRightPanelProps {
  selectedFile?: SelectedTemplateFile
}

export function TemplateRightPanel({ selectedFile }: TemplateRightPanelProps) {
  if (!selectedFile) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a template file to view</p>
      </div>
    )
  }

  const { templateName, fileName, content } = selectedFile

  return (
    <div className="w-full flex-1 flex flex-col min-w-0 pt-0 pb-0 rounded-none">
      <div className="shrink-0 px-4 py-2">
        <span className="text-xs text-muted-foreground font-mono">
          {templateName}/{fileName}
        </span>
      </div>
      <div className="flex-1 mt-1 rounded-4xl bg-muted border shadow-sm overflow-hidden w-[580px]">
        <pre className="h-full p-4 font-mono text-sm text-foreground whitespace-pre-wrap break-words overflow-auto">
          {content}
        </pre>
      </div>
    </div>
  )
}
