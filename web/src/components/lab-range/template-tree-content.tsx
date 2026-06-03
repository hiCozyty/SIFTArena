import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree"
import { Folder, FolderOpen, File } from "lucide-react"
import type { SelectedTemplateFile } from "@/components/lab-range/template-right-panel"

type TemplateItem = {
  id: number
  label: string
  subText: string
  icon: string
}

type PackerFiles = Record<string, { name: string; content: string }[]>

interface TemplateTreeContentProps {
  items: TemplateItem[]
  selectedFile?: SelectedTemplateFile
  onFileSelect?: (file: SelectedTemplateFile) => void
  packerFiles?: PackerFiles
}

function getFileIcon(filename: string) {
  if (filename.endsWith(".hcl")) return <File className="h-4 w-4 text-orange-400" />
  if (filename.endsWith(".xml")) return <File className="h-4 w-4 text-blue-400" />
  if (filename.endsWith(".md")) return <File className="h-4 w-4 text-green-400" />
  return <File className="h-4 w-4" />
}

export function TemplateTreeContent({ items, selectedFile, onFileSelect, packerFiles }: TemplateTreeContentProps) {
  const builtTemplates = items.filter((item) => item.subText === "Built")

  const allIds = builtTemplates.map((t) => `template-${t.id}`)

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0 overflow-clip">
        <TreeProvider defaultExpandedIds={allIds} className="h-full" collapseDisabled>
          <div className="h-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TreeView className="p-0">
              {builtTemplates.map((template, idx) => {
                const files = packerFiles?.[template.label] ?? []
                return (
                <TreeNode
                  key={template.id}
                  nodeId={`template-${template.id}`}
                  level={0}
                  isLast={idx === builtTemplates.length - 1}
                >
                  <TreeNodeTrigger>
                    <TreeExpander hasChildren={false} />
                    <TreeIcon icon={<FolderOpen className="h-4 w-4" />} />
                    <TreeLabel className="whitespace-normal break-words">{template.label}</TreeLabel>
                  </TreeNodeTrigger>
                  {files.length > 0 && (
                    <TreeNodeContent hasChildren>
                      {files.map((file, fileIdx) => (
                        <TreeNode
                          key={`${template.id}-${fileIdx}`}
                          nodeId={`template-${template.id}-${fileIdx}`}
                          level={1}
                          isLast={fileIdx === files.length - 1}
                        >
                          <TreeNodeTrigger
                            onClick={() => onFileSelect?.({ templateName: template.label, fileName: file.name, content: file.content })}
                            className={cn(
                              selectedFile?.templateName === template.label && selectedFile?.fileName === file.name && "bg-primary/10",
                            )}
                          >
                    <TreeExpander hasChildren={files.length > 0} />
                            <TreeIcon icon={getFileIcon(file.name)} />
                            <TreeLabel className="whitespace-normal break-words">{file.name}</TreeLabel>
                          </TreeNodeTrigger>
                        </TreeNode>
                      ))}
                    </TreeNodeContent>
                  )}
                </TreeNode>
                )
              })}
            </TreeView>
          </div>
        </TreeProvider>
      </div>

      <div className="shrink-0 px-3 pb-3 pt-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground">
              <span className="text-base leading-none">+</span>
              Add a Template
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Coming Soon</AlertDialogTitle>
              <AlertDialogDescription>
                This feature will be added at a later time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>OK</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
