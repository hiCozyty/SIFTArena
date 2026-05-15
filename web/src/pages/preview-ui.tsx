import { TabsFancy, type Category, type Item } from "@/components/ui/tabs-fancy"

const categories: Category[] = [
  {
    id: "components",
    label: "Components",
    content: (
      <div>
        <h3 className="text-lg font-semibold mb-2 text-foreground">Components</h3>
        <p className="text-sm text-muted-foreground">
          Browse and manage UI components. Drag items from the sidebar to add them to your workspace.
        </p>
      </div>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    content: (
      <div>
        <h3 className="text-lg font-semibold mb-2 text-foreground">Settings</h3>
        <p className="text-sm text-muted-foreground">
          Configure your workspace preferences, theme, and layout options.
        </p>
      </div>
    ),
  },
]

const items: Item[] = [
  { id: 1, label: "Photos", icon: "📸" },
  { id: 2, label: "Music", icon: "🎵" },
  { id: 3, label: "Videos", icon: "🎬" },
]

export function PreviewUiPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Stateless preview.</strong> This page is for visual inspection only. Components shown here import
        directly from <code>@/components/ui/</code> and must never import from this page. To use a component
        elsewhere, import it from its source file — not from <code>preview-ui</code>.
      </div>

      <h1 className="font-heading text-2xl font-semibold tracking-tight">Preview UI</h1>
      <p className="text-sm text-muted-foreground">Visual reference — not feature code</p>

      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Tabs — Fancy</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Pill-shaped category toggles control content on the right. Items below are draggable.
        </p>
        <TabsFancy categories={categories} items={items} />
      </section>
    </div>
  )
}
