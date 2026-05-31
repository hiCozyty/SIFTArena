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

type TemplateItem = {
  id: number
  label: string
  subText: string
  icon: string
}

interface TemplateTreeContentProps {
  items: TemplateItem[]
}

export function TemplateTreeContent({ items }: TemplateTreeContentProps) {
  const builtTemplates = items.filter((item) => item.subText === "Built")

  const allIds = builtTemplates.map((t) => `template-${t.id}`)

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0 overflow-clip">
        <TreeProvider defaultExpandedIds={allIds} className="h-full">
          <div className="h-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TreeView className="p-0">
              {builtTemplates.map((template, idx) => (
                <TreeNode
                  key={template.id}
                  nodeId={`template-${template.id}`}
                  level={0}
                  isLast={idx === builtTemplates.length - 1}
                >
                  <TreeNodeTrigger>
                    <TreeExpander hasChildren />
                    <TreeIcon icon={<FolderOpen className="h-4 w-4" />} />
                    <TreeLabel className="whitespace-normal break-words">{template.label}</TreeLabel>
                  </TreeNodeTrigger>
                  <TreeNodeContent hasChildren>
                    <TreeNode nodeId={`template-${template.id}-config`} level={1} isLast={false}>
                      <TreeNodeTrigger>
                        <TreeExpander hasChildren={false} />
                        <TreeIcon icon={<File className="h-4 w-4" />} />
                        <TreeLabel className="whitespace-normal break-words">config.yaml</TreeLabel>
                      </TreeNodeTrigger>
                    </TreeNode>
                    <TreeNode nodeId={`template-${template.id}-readme`} level={1} isLast>
                      <TreeNodeTrigger>
                        <TreeExpander hasChildren={false} />
                        <TreeIcon icon={<File className="h-4 w-4" />} />
                        <TreeLabel className="whitespace-normal break-words">README.md</TreeLabel>
                      </TreeNodeTrigger>
                    </TreeNode>
                  </TreeNodeContent>
                </TreeNode>
              ))}
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
