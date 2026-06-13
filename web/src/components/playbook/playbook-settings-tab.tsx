import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
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
        <Label htmlFor="stagger">Stagger between timeline events (ms)</Label>
        <Input
          id="stagger"
          type="number"
          className="w-32 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={settings.staggerBetweenEvents}
          onChange={(e) => onSettingsChange({ ...settings, staggerBetweenEvents: Number(e.target.value) })}
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
        <Label htmlFor="bgStagger">Persistent background events stagger (ms)</Label>
        <Input
          id="bgStagger"
          type="number"
          className="w-32 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={settings.persistentBgStagger}
          onChange={(e) => onSettingsChange({ ...settings, persistentBgStagger: Number(e.target.value) })}
        />
      </div>
      <Separator className="my-4" />
      <div>
        <Label>Timeline technique signal to background noise ratio</Label>
        <div className="mt-2 flex items-center gap-4">
          <Slider
            min={1}
            max={50}
            step={1}
            value={[settings.signalToNoiseRatio]}
            onValueChange={([v]) => onSettingsChange({ ...settings, signalToNoiseRatio: v })}
          />
          <span className="w-12 text-right text-sm font-mono">1:{settings.signalToNoiseRatio}</span>
        </div>
      </div>
    </div>
  )
}
