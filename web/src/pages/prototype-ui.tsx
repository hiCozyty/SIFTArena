import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type TestVm = {
  key: string
  hostname: string
}

function DeleteDialogTest() {
  const [pendingDelete, setPendingDelete] = useState<TestVm | null>(null)
  const [deletingVm, setDeletingVm] = useState(false)
  const [deleteComplete, setDeleteComplete] = useState(false)

  const openDialog = () => {
    console.log("[test] Opening delete dialog")
    setDeleteComplete(false)
    setPendingDelete({ key: "test-vm", hostname: "test-vm" })
  }

  const confirmDeleteVm = async () => {
    console.log("[test] confirmDeleteVm called", { pendingDelete })
    if (!pendingDelete) {
      console.log("[test] pendingDelete is null, returning")
      return
    }

    console.log("[test] Setting deletingVm=true")
    setDeletingVm(true)
    try {
      console.log("[test] Starting fake async operation (3s delay)")
      await new Promise((resolve) => setTimeout(resolve, 3000))
      console.log("[test] Async operation complete")
      console.log("[test] Setting deleteComplete=true")
      setDeleteComplete(true)
    } catch (err) {
      console.error("[test] Unexpected error:", err)
      setDeleteComplete(true)
    } finally {
      console.log("[test] Setting deletingVm=false")
      setDeletingVm(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Delete Dialog Test</h2>
      <p className="text-sm text-muted-foreground">
        Tests the 3-button dialog with fake 3-second async operation. Check console for logs.
      </p>
      <Button onClick={openDialog} className="w-fit">
        Open Delete Dialog
      </Button>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { console.log("[test] onOpenChange called:", { open, deletingVm, deleteComplete }); if (!open && !deletingVm) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete VM</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteComplete
                ? `"${pendingDelete?.hostname}" has been deleted.`
                : `Are you sure you want to delete "${pendingDelete?.hostname}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingVm} onClick={() => setPendingDelete(null)}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDeleteVm} disabled={deletingVm || deleteComplete}>
              {deletingVm ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
            <Button onClick={() => setPendingDelete(null)} disabled={!deleteComplete}>Close</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

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

      <DeleteDialogTest />
    </div>
  )
}
