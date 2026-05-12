import { Spinner, type SpinnerProps } from "@/components/ui/spinner"
import SmallSpinnerExample from "@/components/examples/spinner/standard/small-spinner"
import LargeSpinnerExample from "@/components/examples/spinner/standard/large-spinner"
import MutedSpinnerExample from "@/components/examples/spinner/standard/muted-spinner"
import PrimaryColorSpinnerExample from "@/components/examples/spinner/standard/primary-color-spinner"
import SpinnerInlineWithTextExample from "@/components/examples/spinner/inline/spinner-inline-with-text"
import SpinnerBeforeTextExample from "@/components/examples/spinner/inline/spinner-before-text"
import SpinnerAfterTextExample from "@/components/examples/spinner/inline/spinner-after-text"
import SpinnerInItemExample from "@/components/examples/spinner/applications/spinner-in-item"
import { Separator } from "@/components/ui/separator"

const variants: SpinnerProps["variant"][] = [
  "default",
  "circle",
  "pinwheel",
  "circle-filled",
  "ellipsis",
  "ring",
  "bars",
  "infinite",
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

      {/* All 8 Spinner Variants */}
      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Spinner — All Variants</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          8 animated variants: lucide-react icons (default, circle, pinwheel, circle-filled) + SVG animations
          (ellipsis, ring, bars, infinite).
        </p>
        <div className="flex flex-wrap items-center gap-6">
          {variants.map(variant => (
            <div key={variant} className="flex items-center gap-2">
              <Spinner variant={variant} size={20} />
              <span className="text-sm">{variant}</span>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* Sizes */}
      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Spinner — Sizes</h2>
        <p className="mb-4 text-sm text-muted-foreground">Size 3 (12px) / default (16px) / size 8 (32px).</p>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <SmallSpinnerExample />
            <span className="text-sm">example text</span>
          </div>
          <div className="flex items-center gap-2">
            <Spinner />
            <span className="text-sm">example text</span>
          </div>
          <div className="flex items-center gap-2">
            <LargeSpinnerExample />
            <span className="text-sm">example text</span>
          </div>
        </div>
      </section>

      <Separator />

      {/* Colors */}
      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Spinner — Colors</h2>
        <p className="mb-4 text-sm text-muted-foreground">Apply text color utilities.</p>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <MutedSpinnerExample />
            <span className="text-sm">muted</span>
          </div>
          <div className="flex items-center gap-2">
            <PrimaryColorSpinnerExample />
            <span className="text-sm">primary</span>
          </div>
          <div className="flex items-center gap-2">
            <Spinner className="text-destructive" />
            <span className="text-sm">destructive</span>
          </div>
          <div className="flex items-center gap-2">
            <Spinner className="text-green-500" />
            <span className="text-sm">custom green</span>
          </div>
          <div className="flex items-center gap-2">
            <Spinner className="text-amber-500" />
            <span className="text-sm">custom amber</span>
          </div>
        </div>
      </section>

      <Separator />

      {/* Inline with Text */}
      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Spinner — Inline with Text</h2>
        <p className="mb-4 text-sm text-muted-foreground">Spinner before/after text or centered in a row.</p>
        <div className="flex flex-wrap items-center gap-6">
          <SpinnerBeforeTextExample />
          <SpinnerAfterTextExample />
          <SpinnerInlineWithTextExample />
        </div>
      </section>

      <Separator />

      {/* In Buttons */}
      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Spinner — Inside Buttons</h2>
        <p className="mb-4 text-sm text-muted-foreground">Spinner alongside button text for loading states.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow">
            <Spinner className="size-4" />
            example text
          </button>
          <button className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm">
            <Spinner className="size-4" />
            example text
          </button>
          <button className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow">
            <Spinner className="size-4" />
            example text
          </button>
        </div>
      </section>

      <Separator />

      {/* In Item Card */}
      <section>
        <h2 className="font-heading mb-1 text-xl font-semibold tracking-tight">Spinner — Inside an Item Card</h2>
        <p className="mb-4 text-sm text-muted-foreground">Full example with progress bar and cancel action.</p>
        <SpinnerInItemExample />
      </section>
    </div>
  )
}
