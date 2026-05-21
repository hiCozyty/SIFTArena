import { AttackerConfigUIDemo } from "@/components/attacker-config-ui-demo"

export function PrototypeUI() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 p-8">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Prototype.</strong> This page is for prototyping real feature usage. Components shown here import
        directly from <code>@/components/ui/</code>. To use a component
        elsewhere, import it from its source file — not from here.
      </div>

      <h1 className="font-heading text-2xl font-semibold tracking-tight">Prototype UI</h1>
      <p className="text-sm text-muted-foreground">Prototyping the real feature</p>

      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Attacker Config UI</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Reusable components for the attacker configuration UI.
        </p>
        <AttackerConfigUIDemo />
      </section>
    </div>
  )
}
