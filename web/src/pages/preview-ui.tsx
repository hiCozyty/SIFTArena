import { useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Folder,
  Info,
  Loader2,
  Menu,
  Minus,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  LogOut,
  Bell,
  AlertCircle,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge, badgeVariants } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle, AlertAction } from "@/components/ui/alert"
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { TypingIndicator } from "@/components/ui/typing-indicator"
import { CopyButton } from "@/components/ui/copy-button"
import { FilePreview } from "@/components/ui/file-preview"
import { MarkdownRenderer } from "@/components/ui/markdown-renderer"
import { PromptSuggestions } from "@/components/ui/prompt-suggestions"
import { InterruptPrompt } from "@/components/ui/interrupt-prompt"
import { ChatMessage, type Message } from "@/components/ui/chat-message"
import { MessageList } from "@/components/ui/message-list"
import { Chat, ChatContainer, ChatForm, ChatMessages } from "@/components/ui/chat"
import { MessageInput } from "@/components/ui/message-input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"

const SECTION_NAV = [
  { id: "chat", label: "Chat Components" },
  { id: "buttons", label: "Buttons" },
  { id: "forms", label: "Forms" },
  { id: "data-display", label: "Data Display" },
  { id: "layout", label: "Layout" },
  { id: "navigation", label: "Navigation" },
  { id: "overlays", label: "Overlays" },
  { id: "feedback", label: "Feedback" },
]

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 border-b pb-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  )
}

function DemoCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border">
      <div className="border-b bg-muted/30 px-4 py-3">
        <h4 className="font-medium">{title}</h4>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function PropsTable({ props: propList }: { props: { name: string; type: string; default?: string; description: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Prop</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="w-[120px]">Default</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {propList.map((p) => (
            <TableRow key={p.name}>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-medium">{p.name}</code>
              </TableCell>
              <TableCell>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.type}</code>
              </TableCell>
              <TableCell>
                {p.default ? <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.default}</code> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-sm">{p.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function PreviewUI() {
  const [interruptOpen, setInterruptOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [alertDialogOpen, setAlertDialogOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [collapsibleOpen, setCollapsibleOpen] = useState(false)
  const [switchChecked, setSwitchChecked] = useState(false)
  const [progressValue, setProgressValue] = useState(35)
  const [selectedValue, setSelectedValue] = useState("")
  const [nativeSelectValue, setNativeSelectValue] = useState("")
  const [inputValue, setInputValue] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const mockMessages: Message[] = [
    {
      id: "1",
      role: "user",
      content: "How do I deploy a Kubernetes cluster on AWS?",
      createdAt: new Date(),
    },
    {
      id: "2",
      role: "assistant",
      content: "",
      createdAt: new Date(),
      parts: [
        { type: "reasoning", reasoning: "The user wants to deploy a K8s cluster on AWS. I should cover EKS as the primary option, mention alternatives like kops or eksctl, and provide a practical example." },
        { type: "text", text: "Here's how to deploy a Kubernetes cluster on AWS using EKS:\n\n```bash\n# Install eksctl\ncurl --silent --location \"https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz\" | tar xz -C /tmp\nsudo mv /tmp/eksctl /usr/local/bin\n\n# Create cluster\neksctl create cluster \\\n  --name my-cluster \\\n  --region us-east-1 \\\n  --nodegroup-name standard-workers \\\n  --node-type t3.medium \\\n  --nodes 3\n```\n\nThis creates a cluster with 3 worker nodes." },
      ],
    },
    {
      id: "3",
      role: "user",
      content: "Can you show me the Terraform equivalent?",
      createdAt: new Date(),
    },
    {
      id: "4",
      role: "assistant",
      content: "",
      createdAt: new Date(),
      parts: [
        { type: "text", text: "Here's the Terraform configuration:\n\n```hcl\nmodule \"eks\" {\n  source          = \"terraform-aws-modules/eks/aws\"\n  cluster_name    = \"my-cluster\"\n  cluster_version = \"1.28\"\n  subnet_ids      = module.vpc.private_subnets\n\n  eks_managed_node_groups = {\n    default = {\n      instance_types = [\"t3.medium\"]\n      min_size       = 1\n      max_size       = 5\n      desired_size   = 3\n    }\n  }\n}\n```\n\nRun `terraform init && terraform apply` to deploy." },
        { type: "tool-invocation", toolInvocation: { state: "result", toolName: "terraform-plan", result: { changes: { add: 12, change: 0, destroy: 0 }, duration: "2.3s" } } },
      ],
    },
  ]

  const mockToolMessages: Message[] = [
    {
      id: "t1",
      role: "assistant",
      content: "",
      parts: [
        { type: "tool-invocation", toolInvocation: { state: "call", toolName: "scan-target" } },
        { type: "tool-invocation", toolInvocation: { state: "partial-call", toolName: "analyze-ports" } },
        { type: "tool-invocation", toolInvocation: { state: "result", toolName: "deploy-exploit", result: { __cancelled: true } } },
      ],
    },
  ]

  const mockFile = new File(["test content"], "test.txt", { type: "text/plain" })

  return (
    <div className="flex min-h-screen">
      {/* Sidebar Nav */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r bg-background p-4 lg:block">
        <h3 className="mb-4 font-semibold text-sm text-muted-foreground uppercase tracking-wide">Components</h3>
        <nav className="space-y-1">
          {SECTION_NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Mobile Nav */}
      <div className="sticky top-0 z-50 w-full border-b bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="flex gap-2 overflow-x-auto text-sm">
          {SECTION_NAV.map((item) => (
            <a key={item.id} href={`#${item.id}`} className="shrink-0 rounded-full border px-3 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12">
            <h1 className="text-3xl font-bold tracking-tight">Component Gallery</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              All components from <code className="rounded bg-muted px-1.5 py-0.5 text-sm">shadcn-chatbot-kit</code> and <code className="rounded bg-muted px-1.5 py-0.5 text-sm">shadcn/ui</code> available in this project.
            </p>
          </div>

          {/* ==================== CHAT COMPONENTS ==================== */}
          <Section id="chat" title="Chat Components" description="Components for building AI chat interfaces from shadcn-chatbot-kit">
            <DemoCard title="ChatMessage — User Bubble" description="User message with markdown rendering">
              <ChatMessage role="user" content="How do I deploy a Kubernetes cluster on AWS?" animation="scale" />
            </DemoCard>
            <DemoCard title="ChatMessage — User Bubble (animation variants)">
              <div className="space-y-4">
                <ChatMessage role="user" content="slide animation" animation="slide" />
                <ChatMessage role="user" content="scale animation" animation="scale" />
                <ChatMessage role="user" content="fade animation" animation="fade" />
                <ChatMessage role="user" content="no animation" animation="none" />
              </div>
            </DemoCard>
            <DemoCard title="ChatMessage — Assistant Bubble with Parts" description="Reasoning + text + tool invocation">
              <ChatMessage role="assistant" content="" parts={mockMessages[1].parts} animation="scale" />
            </DemoCard>
            <DemoCard title="ChatMessage — Tool Invocations" description="Call, partial-call, and cancelled result states">
              <ChatMessage role="assistant" content="" parts={mockToolMessages[0].parts} />
            </DemoCard>
            <DemoCard title="ChatMessage — With Timestamp & Actions" description="Hover to see copy button">
              <ChatMessage
                role="assistant"
                content="The answer is 42."
                createdAt={new Date()}
                showTimeStamp
                animation="scale"
                actions={
                  <>
                    <div className="border-r pr-1">
                      <CopyButton content="The answer is 42." copyMessage="Copied!" />
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6"><ThumbsUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6"><ThumbsDown className="h-4 w-4" /></Button>
                  </>
                }
              />
            </DemoCard>

            <PropsTable props={[
              { name: "id", type: "string", description: "Unique message identifier" },
              { name: "role", type: '"user" | "assistant" | string', description: "Message sender role" },
              { name: "content", type: "string", description: "Plain text content (used when no parts)" },
              { name: "createdAt", type: "Date", description: "Message creation timestamp" },
              { name: "parts", type: "MessagePart[]", description: "Structured parts: text, reasoning, tool-invocation, file, step-start" },
              { name: "toolInvocations", type: "ToolInvocation[]", description: "Tool call/result data (legacy, use parts)" },
              { name: "showTimeStamp", type: "boolean", default: "false", description: "Show formatted time below message" },
              { name: "animation", type: '"none" | "slide" | "scale" | "fade"', default: '"scale"', description: "Entrance animation style" },
              { name: "actions", type: "ReactNode", description: "Custom action buttons rendered on hover" },
            ]} />

            <DemoCard title="MessageList" description="Renders a list of messages with typing indicator">
              <MessageList messages={mockMessages.slice(0, 2)} isTyping={false} showTimeStamps />
            </DemoCard>
            <DemoCard title="TypingIndicator" description="Animated dots while assistant is thinking">
              <TypingIndicator />
            </DemoCard>

            <PropsTable props={[
              { name: "messages", type: "Message[]", description: "Array of messages to render" },
              { name: "showTimeStamps", type: "boolean", default: "true", description: "Show timestamps on all messages" },
              { name: "isTyping", type: "boolean", default: "false", description: "Show typing indicator at bottom" },
              { name: "messageOptions", type: "object | function", description: "Additional options per message (actions, animation, etc.)" },
            ]} />

            <DemoCard title="MarkdownRenderer" description="Renders markdown with GFM, syntax highlighting, and copy buttons">
              <MarkdownRenderer>{`# Heading 1\n## Heading 2\n\nThis is **bold** and this is *italic*.\n\n- Item 1\n- Item 2\n- Item 3\n\n\`\`\`python\ndef hello():\n    print("Hello World")\n\`\`\`\n\n| Name | Value |\n|------|-------|\n| A    | 1     |\n| B    | 2     |\n\n> This is a blockquote\n\n[Link example](https://example.com)`}</MarkdownRenderer>
            </DemoCard>

            <PropsTable props={[
              { name: "children", type: "string", description: "Markdown string to render" },
            ]} />

            <DemoCard title="PromptSuggestions" description="Clickable suggestion chips for empty chat states">
              <PromptSuggestions
                label="Try these prompts"
                append={() => {}}
                suggestions={["Explain this technique", "Show me an example", "What are the prerequisites?"]}
              />
            </DemoCard>

            <PropsTable props={[
              { name: "label", type: "string", description: "Header text above suggestions" },
              { name: "append", type: "(message) => void", description: "Callback when a suggestion is clicked" },
              { name: "suggestions", type: "string[]", description: "Array of suggestion text strings" },
            ]} />

            <DemoCard title="MessageInput" description="Rich chat input with auto-resize, attachments, voice, and stop">
              <div className="max-w-xl">
                <MessageInput
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  isGenerating={false}
                  allowAttachments
                  files={null}
                  setFiles={() => {}}
                  placeholder="Ask AI..."
                />
              </div>
            </DemoCard>
            <DemoCard title="MessageInput — Generating State" description="Shows stop button instead of send">
              <div className="max-w-xl">
                <MessageInput
                  value=""
                  onChange={() => {}}
                  isGenerating={true}
                  stop={() => setIsGenerating(false)}
                  placeholder="Generating..."
                />
              </div>
            </DemoCard>

            <PropsTable props={[
              { name: "value", type: "string", description: "Current input value" },
              { name: "placeholder", type: "string", default: '"Ask AI..."', description: "Input placeholder text" },
              { name: "submitOnEnter", type: "boolean", default: "true", description: "Submit form on Enter key" },
              { name: "stop", type: "() => void", description: "Stop generation callback" },
              { name: "isGenerating", type: "boolean", description: "Whether AI is generating (shows stop button)" },
              { name: "enableInterrupt", type: "boolean", default: "true", description: "Show interrupt prompt on double Enter" },
              { name: "allowAttachments", type: "boolean", description: "Enable file attachment UI" },
              { name: "transcribeAudio", type: "(blob) => Promise<string>", description: "Voice transcription callback" },
            ]} />

            <DemoCard title="CopyButton" description="Clipboard copy with animated icon feedback">
              <div className="flex items-center gap-4">
                <CopyButton content="Hello World" copyMessage="Copied!" />
                <CopyButton content="Some code" copyMessage="Code copied!" />
              </div>
            </DemoCard>

            <PropsTable props={[
              { name: "content", type: "string", description: "Text to copy to clipboard" },
              { name: "copyMessage", type: "string", description: "Tooltip text shown after successful copy" },
            ]} />

            <DemoCard title="FilePreview" description="Animated file preview with remove button">
              <div className="flex gap-3">
                <FilePreview file={mockFile} onRemove={() => {}} />
                <FilePreview file={new File(["image data"], "photo.png", { type: "image/png" })} />
              </div>
            </DemoCard>

            <PropsTable props={[
              { name: "file", type: "File", description: "File object to preview" },
              { name: "onRemove", type: "() => void", description: "Remove button callback" },
            ]} />

            <DemoCard title="InterruptPrompt" description="Floating prompt asking user to confirm interrupt">
              <div className="relative h-16">
                <InterruptPrompt isOpen={interruptOpen} close={() => setInterruptOpen(false)} />
                <Button onClick={() => setInterruptOpen(true)} variant="outline">
                  Show Interrupt Prompt
                </Button>
              </div>
            </DemoCard>

            <PropsTable props={[
              { name: "isOpen", type: "boolean", description: "Whether the interrupt prompt is visible" },
              { name: "close", type: "() => void", description: "Close callback" },
            ]} />

            <DemoCard title="Chat (Full Component)" description="Complete chat UI with messages, input, and suggestions">
              <div className="h-[400px] overflow-hidden rounded-lg border">
                <Chat
                  messages={mockMessages}
                  input=""
                  handleInputChange={() => {}}
                  handleSubmit={() => {}}
                  isGenerating={false}
                  suggestions={["How do I use this?", "Show me an example"]}
                append={() => {}}
                  onRateResponse={() => {}}
                />
              </div>
            </DemoCard>

            <DemoCard title="ChatContainer + ChatMessages + ChatForm" description="Composable chat layout building blocks">
              <div className="h-[300px] overflow-hidden rounded-lg border">
                <ChatContainer>
                  <ChatMessages messages={mockMessages}>
                    <MessageList messages={mockMessages} isTyping={false} />
                  </ChatMessages>
                  <ChatForm className="mt-auto" isPending={false} handleSubmit={() => {}}>
                    {() => (
                      <MessageInput value="" onChange={() => {}} isGenerating={false} />
                    )}
                  </ChatForm>
                </ChatContainer>
              </div>
            </DemoCard>
          </Section>

          {/* ==================== BUTTONS ==================== */}
          <Section id="buttons" title="Buttons" description="Button components with variants and groupings">
            <DemoCard title="Button — Variants" description="All visual style variants">
              <div className="flex flex-wrap gap-3">
                <Button variant="default">Default</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="link">Link</Button>
              </div>
            </DemoCard>

            <DemoCard title="Button — Sizes" description="All size variants">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="xs">XS</Button>
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon"><Send className="h-4 w-4" /></Button>
                <Button size="icon-sm"><Send className="h-3 w-3" /></Button>
                <Button size="icon-lg"><Send className="h-5 w-5" /></Button>
              </div>
            </DemoCard>

            <DemoCard title="Button — States" description="Disabled and loading states">
              <div className="flex flex-wrap gap-3">
                <Button disabled>Disabled</Button>
                <Button disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</Button>
              </div>
            </DemoCard>

            <DemoCard title="ButtonGroup" description="Group related buttons with shared borders">
              <div className="flex flex-col gap-4">
                <ButtonGroup>
                  <Button variant="outline">Left</Button>
                  <Button variant="outline">Center</Button>
                  <Button variant="outline">Right</Button>
                </ButtonGroup>
                <ButtonGroup orientation="vertical">
                  <Button variant="outline">Top</Button>
                  <Button variant="outline">Middle</Button>
                  <Button variant="outline">Bottom</Button>
                </ButtonGroup>
                <ButtonGroup>
                  <Button variant="outline"><Plus className="h-4 w-4" /></Button>
                  <ButtonGroupSeparator />
                  <ButtonGroupText>Options</ButtonGroupText>
                  <ButtonGroupSeparator />
                  <Button variant="outline"><Settings className="h-4 w-4" /></Button>
                </ButtonGroup>
              </div>
            </DemoCard>

            <PropsTable props={[
              { name: "variant", type: '"default" | "outline" | "secondary" | "ghost" | "destructive" | "link"', default: '"default"', description: "Visual style variant" },
              { name: "size", type: '"default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"', default: '"default"', description: "Size variant" },
              { name: "asChild", type: "boolean", default: "false", description: "Render as child element (Radix Slot)" },
            ]} />
          </Section>

          {/* ==================== FORMS ==================== */}
          <Section id="forms" title="Forms" description="Form input and selection components">
            <DemoCard title="Input" description="Standard text input fields">
              <div className="space-y-4 max-w-sm">
                <Input placeholder="Default input" />
                <Input type="email" placeholder="Email input" />
                <Input type="password" placeholder="Password input" />
                <Input disabled placeholder="Disabled input" />
              </div>
            </DemoCard>

            <DemoCard title="Label" description="Form field labels">
              <div className="space-y-3 max-w-sm">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </div>
            </DemoCard>

            <DemoCard title="Select" description="Custom styled select dropdown with search">
              <Select value={selectedValue} onValueChange={setSelectedValue}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select a framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Frameworks</SelectLabel>
                    <SelectItem value="react">React</SelectItem>
                    <SelectItem value="vue">Vue</SelectItem>
                    <SelectItem value="svelte">Svelte</SelectItem>
                    <SelectItem value="angular">Angular</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </DemoCard>

            <DemoCard title="NativeSelect" description="Styled native &lt;select&gt; element">
              <NativeSelect value={nativeSelectValue} onChange={(e) => setNativeSelectValue(e.target.value)}>
                <NativeSelectOption value="">Choose...</NativeSelectOption>
                <NativeSelectOption value="a">Option A</NativeSelectOption>
                <NativeSelectOption value="b">Option B</NativeSelectOption>
                <NativeSelectOption value="c">Option C</NativeSelectOption>
              </NativeSelect>
            </DemoCard>

            <DemoCard title="Switch" description="Toggle switch with size variants">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={switchChecked} onCheckedChange={setSwitchChecked} />
                  <Label>{switchChecked ? "On" : "Off"}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch size="sm" />
                  <Label className="text-sm">Small</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch size="default" />
                  <Label className="text-sm">Default</Label>
                </div>
              </div>
            </DemoCard>

            <PropsTable props={[
              { name: "checked", type: "boolean", description: "Controlled checked state" },
              { name: "onCheckedChange", type: "(checked: boolean) => void", description: "Checked state change callback" },
              { name: "size", type: '"sm" | "default"', default: '"default"', description: "Size variant" },
            ]} />
          </Section>

          {/* ==================== DATA DISPLAY ==================== */}
          <Section id="data-display" title="Data Display" description="Components for displaying data and status">
            <DemoCard title="Badge" description="Status and category labels">
              <div className="flex flex-wrap gap-2">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="ghost">Ghost</Badge>
                <Badge variant="link">Link</Badge>
              </div>
            </DemoCard>

            <DemoCard title="Avatar" description="User avatars with fallbacks, badges, and groups">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <Avatar size="sm"><AvatarFallback>AB</AvatarFallback></Avatar>
                  <Avatar><AvatarFallback>CD</AvatarFallback></Avatar>
                  <Avatar size="lg"><AvatarFallback>EF</AvatarFallback></Avatar>
                </div>
                <div className="flex items-center gap-4">
                  <Avatar><AvatarFallback>AB</AvatarFallback><AvatarBadge /></Avatar>
                  <Avatar><AvatarFallback>CD</AvatarFallback></Avatar>
                </div>
                <AvatarGroup>
                  <Avatar><AvatarFallback>A</AvatarFallback></Avatar>
                  <Avatar><AvatarFallback>B</AvatarFallback></Avatar>
                  <Avatar><AvatarFallback>C</AvatarFallback></Avatar>
                  <Avatar><AvatarFallback>D</AvatarFallback></Avatar>
                  <AvatarGroupCount count={5} />
                </AvatarGroup>
              </div>
            </DemoCard>

            <DemoCard title="Table" description="Styled HTML table">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Attack</TableHead><TableHead>Protocol</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow><TableCell>SQL Injection</TableCell><TableCell>HTTP</TableCell><TableCell><Badge variant="destructive">Critical</Badge></TableCell><TableCell><Badge>Active</Badge></TableCell></TableRow>
                  <TableRow><TableCell>XSS</TableCell><TableCell>HTTP</TableCell><TableCell><Badge variant="secondary">High</Badge></TableCell><TableCell><Badge variant="outline">Mitigated</Badge></TableCell></TableRow>
                  <TableRow><TableCell>CSRF</TableCell><TableCell>HTTP</TableCell><TableCell><Badge variant="secondary">Medium</Badge></TableCell><TableCell><Badge variant="ghost">Monitoring</Badge></TableCell></TableRow>
                </TableBody>
              </Table>
            </DemoCard>

            <DemoCard title="Progress" description="Horizontal progress bar">
              <div className="space-y-4 max-w-md">
                <Progress value={progressValue} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setProgressValue((v) => Math.max(0, v - 10))}><Minus className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setProgressValue((v) => Math.min(100, v + 10))}><Plus className="h-3 w-3" /></Button>
                  <span className="text-sm text-muted-foreground">{progressValue}%</span>
                </div>
              </div>
            </DemoCard>

            <DemoCard title="Spinner" description="Loading spinners with 8 visual variants">
              <div className="flex flex-wrap items-center gap-6">
                {(["default", "circle", "pinwheel", "circle-filled", "ellipsis", "ring", "bars", "infinite"] as const).map((v) => (
                  <div key={v} className="flex flex-col items-center gap-2">
                    <Spinner variant={v} size={24} />
                    <span className="text-xs text-muted-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </DemoCard>

            <DemoCard title="Empty" description="Empty state placeholder">
              <Empty className="max-w-md border rounded-lg p-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Search className="h-8 w-8 text-muted-foreground" /></EmptyMedia>
                  <EmptyTitle>No results found</EmptyTitle>
                  <EmptyDescription>Try adjusting your search or filter criteria.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline">Clear filters</Button>
                </EmptyContent>
              </Empty>
            </DemoCard>

            <DemoCard title="Item" description="Generic list item with media and content">
              <div className="space-y-2 max-w-md">
                <Item variant="outline">
                  <ItemMedia><Folder className="h-5 w-5" /></ItemMedia>
                  <ItemContent>
                    <ItemTitle>Attack Configurations</ItemTitle>
                    <ItemDescription>12 saved configurations</ItemDescription>
                  </ItemContent>
                </Item>
                <Item variant="muted" size="sm">
                  <ItemMedia variant="icon"><Terminal className="h-4 w-4" /></ItemMedia>
                  <ItemContent>
                    <ItemTitle>Network Scan</ItemTitle>
                    <ItemDescription>Last run: 2 hours ago</ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </DemoCard>
          </Section>

          {/* ==================== LAYOUT ==================== */}
          <Section id="layout" title="Layout" description="Structural and spacing components">
            <DemoCard title="Card" description="Content card with header, content, and footer">
              <div className="flex flex-wrap gap-4">
                <Card className="max-w-sm">
                  <CardHeader>
                    <CardTitle>Attack Configuration</CardTitle>
                    <CardDescription>Set up your attack parameters</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Configure the target, technique, and payload for your attack simulation.</p>
                  </CardContent>
                  <CardFooter>
                    <Button>Launch Attack</Button>
                  </CardFooter>
                </Card>
                <Card size="sm" className="max-w-sm">
                  <CardHeader>
                    <CardTitle>Small Card</CardTitle>
                    <CardDescription>Compact variant</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">This is a smaller card with reduced padding.</p>
                  </CardContent>
                </Card>
              </div>
            </DemoCard>

            <DemoCard title="Separator" description="Horizontal and vertical dividers">
              <div className="space-y-4">
                <div>
                  <p className="text-sm">Above</p>
                  <Separator className="my-2" />
                  <p className="text-sm">Below</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">Left</span>
                  <Separator orientation="vertical" className="h-6" />
                  <span className="text-sm">Right</span>
                </div>
              </div>
            </DemoCard>

            <DemoCard title="Resizable" description="Draggable resizable panels">
              <ResizablePanelGroup direction="horizontal" className="min-h-[200px] max-w-md rounded-lg border">
                <ResizablePanel defaultSize={50}>
                  <div className="flex h-full items-center justify-center p-4"><span className="text-sm text-muted-foreground">Panel 1</span></div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50}>
                  <ResizablePanelGroup direction="vertical">
                    <ResizablePanel defaultSize={50}>
                      <div className="flex h-full items-center justify-center p-4"><span className="text-sm text-muted-foreground">Panel 2</span></div>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={50}>
                      <div className="flex h-full items-center justify-center p-4"><span className="text-sm text-muted-foreground">Panel 3</span></div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            </DemoCard>
          </Section>

          {/* ==================== NAVIGATION ==================== */}
          <Section id="navigation" title="Navigation" description="Navigation and menu components">
            <DemoCard title="Breadcrumb" description="Navigation trail with separators">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem><BreadcrumbLink href="/components">Components</BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem><BreadcrumbPage>Navigation</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </DemoCard>

            <DemoCard title="Tabs" description="Tab navigation with content panels">
              <Tabs defaultValue="overview" className="max-w-md">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="analytics">Analytics</TabsTrigger>
                  <TabsTrigger value="reports">Reports</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-4 rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Overview content goes here.</p>
                </TabsContent>
                <TabsContent value="analytics" className="mt-4 rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Analytics content goes here.</p>
                </TabsContent>
                <TabsContent value="reports" className="mt-4 rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Reports content goes here.</p>
                </TabsContent>
              </Tabs>
            </DemoCard>
            <DemoCard title="Tabs — Line Variant" description="Underline style tabs">
              <Tabs defaultValue="attack" className="max-w-md">
                <TabsList variant="line">
                  <TabsTrigger value="attack">Attack</TabsTrigger>
                  <TabsTrigger value="defense">Defense</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
                </TabsList>
                <TabsContent value="attack" className="mt-4"><p className="text-sm text-muted-foreground">Attack configuration.</p></TabsContent>
                <TabsContent value="defense" className="mt-4"><p className="text-sm text-muted-foreground">Defense strategies.</p></TabsContent>
                <TabsContent value="analysis" className="mt-4"><p className="text-sm text-muted-foreground">Analysis results.</p></TabsContent>
              </Tabs>
            </DemoCard>

            <DemoCard title="DropdownMenu" description="Context menu with items, shortcuts, and separators">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Open Menu</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem><Settings className="mr-2 h-4 w-4" /><span>Settings</span><DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
                    <DropdownMenuItem><Bell className="mr-2 h-4 w-4" /><span>Notifications</span></DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive"><LogOut className="mr-2 h-4 w-4" /><span>Log out</span><DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </DemoCard>

            <DemoCard title="Menubar" description="Application menu bar">
              <Menubar>
                <MenubarMenu>
                  <MenubarTrigger>File</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem>New Tab <MenubarShortcut>⌘T</MenubarShortcut></MenubarItem>
                    <MenubarItem>New Window <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem>Share</MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem>Print <MenubarShortcut>⌘P</MenubarShortcut></MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
                <MenubarMenu>
                  <MenubarTrigger>Edit</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem>Undo <MenubarShortcut>⌘Z</MenubarShortcut></MenubarItem>
                    <MenubarItem>Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut></MenubarItem>
                    <MenubarSeparator />
                    <MenubarItem>Cut</MenubarItem>
                    <MenubarItem>Copy</MenubarItem>
                    <MenubarItem>Paste</MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
                <MenubarMenu>
                  <MenubarTrigger>View</MenubarTrigger>
                  <MenubarContent>
                    <MenubarItem>Reload <MenubarShortcut>⌘R</MenubarShortcut></MenubarItem>
                    <MenubarItem>Full Screen <MenubarShortcut>⌘⇧F</MenubarShortcut></MenubarItem>
                  </MenubarContent>
                </MenubarMenu>
              </Menubar>
            </DemoCard>

            <DemoCard title="NavigationMenu" description="Horizontal navigation with dropdown content">
              <NavigationMenu>
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <NavigationMenuTrigger>Techniques</NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[300px] gap-3 p-4">
                        <li><NavigationMenuLink className="block rounded-md p-2 hover:bg-muted"><p className="text-sm font-medium">SQL Injection</p><p className="text-xs text-muted-foreground">Database attack vector</p></NavigationMenuLink></li>
                        <li><NavigationMenuLink className="block rounded-md p-2 hover:bg-muted"><p className="text-sm font-medium">XSS</p><p className="text-xs text-muted-foreground">Cross-site scripting</p></NavigationMenuLink></li>
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavigationMenuLink className="inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium hover:bg-muted" href="#">Documentation</NavigationMenuLink>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </DemoCard>

            <DemoCard title="Command" description="Command palette with search (click to open dialog)">
              <div className="flex items-center gap-4">
                <Button variant="outline" onClick={() => setCommandOpen(true)}>
                  <Search className="mr-2 h-4 w-4" />Open Command Palette
                </Button>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
              <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
                <Command>
                  <CommandInput placeholder="Type a command or search..." />
                  <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Suggestions">
                      <CommandItem><Terminal className="mr-2 h-4 w-4" /><span>Terminal</span></CommandItem>
                      <CommandItem><Settings className="mr-2 h-4 w-4" /><span>Settings</span></CommandItem>
                      <CommandItem><Search className="mr-2 h-4 w-4" /><span>Search</span></CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Attacks">
                      <CommandItem><Code2 className="mr-2 h-4 w-4" /><span>SQL Injection</span></CommandItem>
                      <CommandItem><Shield className="mr-2 h-4 w-4" /><span>XSS Attack</span></CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </CommandDialog>
            </DemoCard>

            <DemoCard title="Carousel" description="Slideshow with prev/next navigation">
              <Carousel className="max-w-sm">
                <CarouselContent>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <CarouselItem key={i}>
                      <div className="flex h-32 items-center justify-center rounded-lg border bg-muted">
                        <span className="text-2xl font-bold">{i + 1}</span>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
            </DemoCard>
          </Section>

          {/* ==================== OVERLAYS ==================== */}
          <Section id="overlays" title="Overlays" description="Modal dialogs, sheets, and tooltips">
            <DemoCard title="Dialog" description="Modal dialog with header, content, and footer">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Attack Configuration</DialogTitle>
                    <DialogDescription>Configure your attack parameters before launching.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="target">Target URL</Label>
                      <Input id="target" placeholder="https://target.example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="technique">Technique</Label>
                      <Select>
                        <SelectTrigger><SelectValue placeholder="Select technique" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sqli">SQL Injection</SelectItem>
                          <SelectItem value="xss">Cross-Site Scripting</SelectItem>
                          <SelectItem value="csrf">CSRF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button>Launch</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </DemoCard>

            <DemoCard title="Sheet" description="Slide-out panel from any side">
              <div className="flex flex-wrap gap-2">
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <Sheet key={side}>
                    <SheetTrigger asChild><Button variant="outline">{side}</Button></SheetTrigger>
                    <SheetContent side={side}>
                      <SheetHeader>
                        <SheetTitle>Attack Details</SheetTitle>
                        <SheetDescription>Panel sliding from {side}.</SheetDescription>
                      </SheetHeader>
                      <div className="py-4">
                        <p className="text-sm text-muted-foreground">Configuration options would go here.</p>
                      </div>
                      <SheetFooter>
                        <SheetClose asChild><Button>Save</Button></SheetClose>
                      </SheetFooter>
                    </SheetContent>
                  </Sheet>
                ))}
              </div>
            </DemoCard>

            <DemoCard title="AlertDialog" description="Confirmation dialog requiring explicit action">
              <AlertDialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete Attack</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone. This will permanently delete the attack configuration and remove all associated data.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DemoCard>

            <DemoCard title="Tooltip" description="Hover/focus tooltip with arrow">
              <TooltipProvider>
                <div className="flex gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild><Button variant="outline">Hover me</Button></TooltipTrigger>
                    <TooltipContent><p>Add attack configuration</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild><Button variant="outline" size="icon"><Trash2 className="h-4 w-4" /></Button></TooltipTrigger>
                    <TooltipContent side="bottom"><p>Delete permanently</p></TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </DemoCard>

            <DemoCard title="Collapsible" description="Expandable/collapsible content section">
              <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen} className="w-full max-w-md space-y-2">
                <div className="flex items-center justify-between space-x-4 rounded-md border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    <span className="text-sm font-medium">Attack Logs</span>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-9 p-0">
                      {collapsibleOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="rounded-md border px-4 py-3">
                  <p className="text-sm text-muted-foreground">SQL injection attempt on /api/users at 14:32:01</p>
                  <p className="text-sm text-muted-foreground">XSS payload delivered to /login at 14:32:05</p>
                  <p className="text-sm text-muted-foreground">CSRF token validated at 14:32:08</p>
                </CollapsibleContent>
              </Collapsible>
            </DemoCard>
          </Section>

          {/* ==================== FEEDBACK ==================== */}
          <Section id="feedback" title="Feedback" description="Alerts, toasts, and status indicators">
            <DemoCard title="Alert" description="Inline notification banners">
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Heads up!</AlertTitle>
                  <AlertDescription>This attack technique requires elevated privileges.</AlertDescription>
                  <AlertAction><Button size="sm" variant="outline">Learn more</Button></AlertAction>
                </Alert>
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>Target server is unreachable. Check your network configuration.</AlertDescription>
                </Alert>
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Security Notice</AlertTitle>
                  <AlertDescription>Ensure you have authorization before running attacks.</AlertDescription>
                </Alert>
              </div>
            </DemoCard>

            <DemoCard title="Toast (Sonner)" description="Toast notifications">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => toast("Attack launched successfully", { description: "SQL injection payload delivered to target." })}>Default Toast</Button>
                <Button variant="outline" onClick={() => toast.success("Scan complete", { description: "Found 3 vulnerabilities." })}>Success Toast</Button>
                <Button variant="outline" onClick={() => toast.error("Connection failed", { description: "Unable to reach target server." })}>Error Toast</Button>
                <Button variant="outline" onClick={() => toast.warning("Rate limit approaching", { description: "Slow down your requests." })}>Warning Toast</Button>
                <Button variant="outline" onClick={() => toast("Action required", { description: "Please confirm the attack parameters.", action: { label: "Confirm", onClick: () => {} } })}>With Action</Button>
              </div>
            </DemoCard>
          </Section>
        </div>
      </main>

      <Toaster />
    </div>
  )
}
