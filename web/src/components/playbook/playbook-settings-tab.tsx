import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import type { PlaybookSettings } from "@/components/playbook/playbook-content"

export function PlaybookSettingsTab({
  settings,
  onSettingsChange,
}: {
  settings: PlaybookSettings
  onSettingsChange: (settings: PlaybookSettings) => void
}) {
  return (
    <div className="flex h-full flex-col overflow-auto p-4">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="waitTime">Wait time between timeline events (ms)</Label>
        <Input
          id="waitTime"
          type="number"
          className="w-32 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={settings.waitTimeBetweenEvents}
          onChange={(e) => onSettingsChange({ ...settings, waitTimeBetweenEvents: Number(e.target.value) })}
        />
      </div>
      <Separator className="my-4" />
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="jitter">Jitter between timeline events (ms)</Label>
        <Input
          id="jitter"
          type="number"
          className="w-32 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={settings.jitterBetweenEvents}
          onChange={(e) => onSettingsChange({ ...settings, jitterBetweenEvents: Number(e.target.value) })}
        />
      </div>
      <Separator className="my-4" />
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="bgRandomize">Persistent background events randomize</Label>
        <Switch
          id="bgRandomize"
          checked={settings.persistentBgRandomize}
          onCheckedChange={(v) => onSettingsChange({ ...settings, persistentBgRandomize: v })}
        />
      </div>
      <Separator className="my-4" />
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="bgInterval">Persistent background events interval (ms)</Label>
        <Input
          id="bgInterval"
          type="number"
          className="w-32 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={settings.persistentBgInterval}
          onChange={(e) => onSettingsChange({ ...settings, persistentBgInterval: Number(e.target.value) })}
        />
      </div>
      <Separator className="my-4" />
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="bgJitter">Persistent background events jitter (ms)</Label>
        <Input
          id="bgJitter"
          type="number"
          className="w-32 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={settings.persistentBgJitter}
          onChange={(e) => onSettingsChange({ ...settings, persistentBgJitter: Number(e.target.value) })}
        />
      </div>
    </div>
  )
}
