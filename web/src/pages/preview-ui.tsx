import { useState } from "react"
import { RiCommandLine, RiArrowDropDownLine, RiCheckLine, RiTrophyLine, RiRobot2Line, RiBarChartLine } from "@remixicon/react"
import { LudusIcon } from "@/components/icons/ludus-icon"
import { CalderaIcon } from "@/components/icons/caldera-icon"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

import SegmentedControlExample from "@/components/examples/button-group/interactive/button-group-segmented-control"
import SheetWithTabsExample from "@/components/examples/sheet/multi-section/sheet-with-tabs"
import MenubarExample from "@/components/examples/menubar/standard/simple-text-menubar"

const SECTIONS = [
  "Leaderboard",
  "Lab Range",
  "Attack Configuration",
  "SIFT Agent",
  "Run Benchmark",
] as const

const SECTION_DESCRIPTIONS: Record<string, string> = {
  Leaderboard: "Ranked player/team scores",
  "Lab Range": "Lab environment management",
  "Attack Configuration": "Configure attack parameters",
  "SIFT Agent": "Select deployed SIFT agents",
  "Run Benchmark": "Execute performance benchmarks",
}

const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Leaderboard: RiTrophyLine,
  "Lab Range": LudusIcon,
  "Attack Configuration": CalderaIcon,
  "SIFT Agent": RiRobot2Line,
  "Run Benchmark": RiBarChartLine,
}

function ContentPreview({ section }: { section: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{section}</CardTitle>
        <CardDescription>{SECTION_DESCRIPTIONS[section]}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Content for <strong>{section}</strong> goes here.
        </p>
      </CardContent>
    </Card>
  )
}

function PatternCard({
  name,
  description,
  children,
}: {
  name: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
            Pattern
          </Badge>
          <CardTitle className="font-heading text-base">{name}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function GroupHeading({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-heading text-xl font-semibold tracking-tight">{title}</h2>
      <Separator className="flex-1" />
    </div>
  )
}

export function PreviewUiPage() {
  const [selectValue, setSelectValue] = useState<string>(SECTIONS[0])
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandValue, setCommandValue] = useState<string>(SECTIONS[0])

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Menu UI Patterns
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visual reference of available shadcn/ui components for building the tabbed menu.
          Click around each pattern to see how it looks with the 5 sections.
        </p>
      </div>

      <Separator />

      <section className="flex flex-col gap-6">
        <GroupHeading title="Tab-Based Navigation" />

        <PatternCard
          name="Tabs — Pills"
          description="Pill-shaped tab bar. Active tab elevated on a white card."
        >
          <Tabs defaultValue={SECTIONS[0]} className="w-full">
            <TabsList>
              {SECTIONS.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
            {SECTIONS.map((s) => (
              <TabsContent key={s} value={s}>
                <ContentPreview section={s} />
              </TabsContent>
            ))}
          </Tabs>
        </PatternCard>

        <PatternCard
          name="Tabs — Underline"
          description="Minimal underline style. Active tab has a thin colored line."
        >
          <Tabs defaultValue={SECTIONS[0]} className="w-full">
            <TabsList variant="line">
              {SECTIONS.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
            {SECTIONS.map((s) => (
              <TabsContent key={s} value={s}>
                <ContentPreview section={s} />
              </TabsContent>
            ))}
          </Tabs>
        </PatternCard>

        <PatternCard
          name="Tabs with Icons"
          description="Tabs with custom SVG icons per section. Ludus for Lab Range, Caldera for Attack Configuration, remixicons for the rest."
        >
          <Tabs defaultValue={SECTIONS[0]} className="w-full">
            <TabsList>
              {SECTIONS.map((s) => {
                const Icon = TAB_ICONS[s]
                return (
                  <TabsTrigger key={s} value={s}>
                    <Icon />
                    {s}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {SECTIONS.map((s) => (
              <TabsContent key={s} value={s}>
                <ContentPreview section={s} />
              </TabsContent>
            ))}
          </Tabs>
        </PatternCard>

        <PatternCard
          name="Button Group Segmented Control"
          description="Segmented-control style tab-like navigation — from shadcnio."
        >
          <SegmentedControlExample />
        </PatternCard>
      </section>

      <section className="flex flex-col gap-6">
        <GroupHeading title="Dropdown &amp; Menu Navigation" />

        <PatternCard
          name="Select Dropdown"
          description="Compact dropdown picker. Saves horizontal space."
        >
          <div className="flex flex-col gap-4">
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ContentPreview section={selectValue} />
          </div>
        </PatternCard>

        <PatternCard
          name="DropdownMenu"
          description="Click-triggered dropdown menu for section selection."
        >
          <div className="flex flex-col gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-64 justify-between">
                  <span>Go to section...</span>
                  <RiArrowDropDownLine />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                {SECTIONS.map((s) => (
                  <DropdownMenuItem key={s}>
                    {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-sm text-muted-foreground">
              Click the button above to open the dropdown.
            </p>
          </div>
        </PatternCard>

        <PatternCard
          name="NavigationMenu"
          description="Mega menu with sub-content panels for each section."
        >
          <NavigationMenu>
            <NavigationMenuList>
              {SECTIONS.map((s) => (
                <NavigationMenuItem key={s}>
                  <NavigationMenuTrigger>{s}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-80 gap-3 p-4">
                      <p className="text-sm font-medium">{s}</p>
                      <p className="text-sm text-muted-foreground">
                        {SECTION_DESCRIPTIONS[s]}
                      </p>
                      <Button size="sm">Open {s}</Button>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </PatternCard>
      </section>

      <section className="flex flex-col gap-6">
        <GroupHeading title="Overlay Navigation" />

        <PatternCard
          name="Sheet with Tabs"
          description="Slide-out sheet panel with tab navigation — from shadcnio."
        >
          <SheetWithTabsExample />
        </PatternCard>

        <PatternCard
          name="Command Palette"
          description="⌘K-style search dialog. Press the button, then type or arrow-key to select."
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setCommandOpen(true)}
                className="w-64 justify-between"
              >
                <span className="text-muted-foreground">Open section...</span>
                <kbd className="flex items-center gap-0.5 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  <RiCommandLine className="size-3" />K
                </kbd>
              </Button>
              <span className="text-sm text-muted-foreground">
                Active: <strong>{commandValue}</strong>
              </span>
            </div>

            <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
              <CommandInput placeholder="Search sections..." />
              <CommandList>
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup heading="Sections">
                  {SECTIONS.map((s) => (
                    <CommandItem
                      key={s}
                      onSelect={() => {
                        setCommandValue(s)
                        setCommandOpen(false)
                      }}
                    >
                      <RiCheckLine className="size-4" />
                      {s}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </CommandDialog>

            <ContentPreview section={commandValue} />
          </div>
        </PatternCard>
      </section>

      <section className="flex flex-col gap-6">
        <GroupHeading title="Desktop-Style Navigation" />

        <PatternCard
          name="Menubar"
          description="Desktop-style menu bar with File menu — from shadcnio."
        >
          <MenubarExample />
        </PatternCard>

        <PatternCard
          name="Breadcrumb"
          description="Hierarchical breadcrumb trail showing current page location."
        >
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Benchmarks</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Run Benchmark</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </PatternCard>
      </section>
    </div>
  )
}
