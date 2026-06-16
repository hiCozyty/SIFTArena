/**
 * workflows-powershell-truncation.test.js
 * Verifies that PowerShell Event 4104 (ScriptBlock) rawPreview is NOT truncated.
 *
 * Bug: piping evtxexport XML output over SSH stdout silently drops data
 * for large events, truncating rawPreview to ~225 characters regardless of
 * the slice(0, 32000) limit applied in parseEvtx.
 *
 * This test uses Python-on-SIFT parsing (subprocess.run with capture_output)
 * which reads the full XML locally on SIFT, avoiding SSH pipe truncation.
 *
 * Run: bun test server/workflows/test/workflows-powershell-truncation.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import {
  mountEvidenceToSift,
  unmountEvidenceFromSift,
} from "../workflows.js"

const PLAYBOOK = "five_abilities_no_noise"
const EVIDENCE_PATH = `/home/sift/evidence/${PLAYBOOK}`
const E01 = `${EVIDENCE_PATH}/disk-image.E01`

const SSH_OPTS = [
  "sshpass", "-p", "forensics", "ssh",
  "-p", "2222",
  "-o", "StrictHostKeyChecking=no",
  "-o", "UserKnownHostsFile=/dev/null",
  "-o", "LogLevel=ERROR",
  "-n",
  "sift@localhost",
]

async function sift(cmd, timeoutMs = 60_000) {
  const proc = Bun.spawn([...SSH_OPTS, cmd], {
    stdin: "ignore",
    timeout: timeoutMs,
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  await proc.exited
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: proc.exitCode }
}

let ntfsOffset = null
let powershellInode = null
let windowStartMs = null
let windowEndMs = null

beforeAll(async () => {
  const result = await mountEvidenceToSift(null, null, {
    data: { path: PLAYBOOK }
  }, null)

  expect(result.success).toBe(true)
  expect(result.output).toContain("MOUNT_OFFSET:")

  const match = result.output.match(/MOUNT_OFFSET:(\d+)/)
  expect(match).not.toBeNull()
  ntfsOffset = parseInt(match[1], 10)
  expect(ntfsOffset).toBeGreaterThan(0)

  console.log(`[setup] NTFS offset: ${ntfsOffset}`)

  // Read attack chain window from groundTruth.json
  const groundTruthPath = `${import.meta.dir}/../../../groundTruth/${PLAYBOOK}/groundTruth.json`
  try {
    const gt = await Bun.file(groundTruthPath).json()
    const timeline = gt.timeline || []
    if (timeline.length > 0) {
      const starts = timeline.map(a => a.startedAt)
      const ends = timeline.map(a => a.finishedAt)
      // Apply 5s buffer matching preAgentStagingPipeline
      windowStartMs = Math.min(...starts) - 5000
      windowEndMs = Math.max(...ends) + 5000
    } else {
      windowStartMs = (gt.startedAt || 0) - 5000
      windowEndMs = (gt.finishedAt || 0) + 5000
    }
  } catch {
    console.log("[setup] groundTruth.json not found, skipping time-window assertions")
  }

  if (windowStartMs && windowEndMs) {
    console.log(`[setup] Window from groundTruth: ${new Date(windowStartMs).toISOString()} to ${new Date(windowEndMs).toISOString()}`)
  }

  const { stdout } = await sift(
    `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "PowerShell%4Operational.evtx" | head -5`,
    90_000
  )
  const inodeMatch = stdout.match(/(\d+)-\d+-\d+:\s/)
  if (inodeMatch) {
    powershellInode = inodeMatch[1]
    console.log(`[setup] PowerShell inode: ${powershellInode}`)
  } else {
    console.log("[setup] No PowerShell EVTX found on this image")
  }
}, 120_000)

describe("PowerShell Event 4104 truncation", () => {
  it("extracts PowerShell EVTX and parses with Python-on-SIFT (no SSH pipe)", async () => {
    if (!powershellInode) {
      console.log("[skip] No PowerShell EVTX inode discovered")
      return
    }

    const script = `import re, json
from datetime import datetime

with open('/tmp/test_ps.xml', 'r', errors='replace') as f:
    xml = f.read()

WINDOW_START = ${windowStartMs}
WINDOW_END = ${windowEndMs}
events = []
event4104_count = 0
max_4104_len = 0
min_4104_len = None

blocks = re.split(r'(?=<Event[ >])', xml)
for block in blocks:
    if '<Event' not in block:
        continue
    eid_m = re.search(r'<EventID>(\\d+)</EventID>', block)
    ts_m = re.search(r'TimeCreated SystemTime="([^"]+)"', block)
    if not eid_m or not ts_m:
        continue
    eid = int(eid_m.group(1))
    try:
        ts_str = ts_m.group(1).replace('Z', '+00:00')
        ts_clean = re.sub(r'(\\.\\d{6})\\d+', r'\\1', ts_str)
        ts = datetime.fromisoformat(ts_clean)
        ts_ms = int(ts.timestamp() * 1000)
    except:
        continue
    if ts_ms < WINDOW_START or ts_ms > WINDOW_END:
        continue
    limit = 32000 if eid == 4104 else 3000
    events.append({'eventId': eid, 'timestamp': ts_ms, 'rawPreview': block[:limit]})
    if eid == 4104:
        event4104_count += 1
        blen = len(block[:limit])
        max_4104_len = max(max_4104_len, blen)
        min_4104_len = blen if min_4104_len is None else min(min_4104_len, blen)

with open('/tmp/test_ps_parsed.json', 'w') as f:
    json.dump(events, f)

print(f"total_events:{len(events)}")
print(f"event4104_count:{event4104_count}")
print(f"max_4104_len:{max_4104_len}")
print(f"min_4104_len:{min_4104_len}")
print(f"dbg_xml_len:{len(xml)}")
print(f"dbg_blocks:{len(blocks)}")
print(f"dbg_win_start:{WINDOW_START}")
print(f"dbg_win_end:{WINDOW_END}")
`

    const encoded = Buffer.from(script).toString("base64")

    const { stdout, exitCode } = await sift(
      `sudo icat -o ${ntfsOffset} "${E01}" ${powershellInode} > /tmp/test_ps.evtx 2>/dev/null && \
evtxexport -f xml /tmp/test_ps.evtx > /tmp/test_ps.xml 2>/dev/null && \
echo '${encoded}' | base64 -d > /tmp/test_ps_parse.py && \
python3 /tmp/test_ps_parse.py`,
      180_000
    )

    console.log(`[parse] ${stdout}`)

    const totalMatch = stdout.match(/total_events:(\d+)/)
    const count4104Match = stdout.match(/event4104_count:(\d+)/)
    const max4104Match = stdout.match(/max_4104_len:(\d+)/)
    const min4104Match = stdout.match(/min_4104_len:(\d+)/)

    const totalEvents = totalMatch ? parseInt(totalMatch[1], 10) : 0
    const event4104Count = count4104Match ? parseInt(count4104Match[1], 10) : 0
    const max4104Len = max4104Match ? parseInt(max4104Match[1], 10) : 0
    const min4104Len = min4104Match ? parseInt(min4104Match[1], 10) : 0

    console.log(`[parse] Total events in window: ${totalEvents}`)
    console.log(`[parse] Event 4104 count: ${event4104Count}`)
    console.log(`[parse] Event 4104 max rawPreview: ${max4104Len}`)
    console.log(`[parse] Event 4104 min rawPreview: ${min4104Len}`)

    expect(event4104Count).toBeGreaterThan(100)

    if (event4104Count > 0) {
      expect(max4104Len).toBeGreaterThan(2000)
    }
  }, 240_000)

  it("reads parsed JSON and verifies 4104 rawPreview is not truncated", async () => {
    if (!powershellInode) {
      console.log("[skip] No PowerShell EVTX inode discovered")
      return
    }

    const { stdout: jsonStr } = await sift("cat /tmp/test_ps_parsed.json", 60_000)
    expect(jsonStr.length).toBeGreaterThan(0)

    const events = JSON.parse(jsonStr)
    expect(Array.isArray(events)).toBe(true)
    console.log(`[verify] Total parsed events: ${events.length}`)

    const event4104s = events.filter(e => e.eventId === 4104)
    const non4104s = events.filter(e => e.eventId !== 4104)

    console.log(`[verify] Event 4104 count: ${event4104s.length}`)

    for (const evt of event4104s) {
      console.log(`[verify] Event 4104 rawPreview length: ${evt.rawPreview.length}`)
      expect(evt.rawPreview.length).toBeGreaterThan(2000)
    }

    for (const evt of non4104s) {
      expect(evt.rawPreview.length).toBeLessThanOrEqual(3000)
    }
  })

  it("4104 rawPreview contains ScriptBlock content (not just XML boilerplate)", async () => {
    if (!powershellInode) {
      console.log("[skip] No PowerShell EVTX inode discovered")
      return
    }

    const { stdout: jsonStr } = await sift("cat /tmp/test_ps_parsed.json", 60_000)
    const events = JSON.parse(jsonStr)
    const event4104s = events.filter(e => e.eventId === 4104)

    if (event4104s.length === 0) {
      console.log("[content] No 4104 events to inspect")
      return
    }

    for (const evt of event4104s) {
      const rp = evt.rawPreview
      console.log(`[content] 4104 first 200 chars: ${rp.slice(0, 200)}`)
      console.log(`[content] 4104 last 200 chars: ${rp.slice(-200)}`)

      expect(rp).toMatch(/EventID|EventData|<Event/i)

      const hasExtendedContent = rp.includes("ScriptBlock") || rp.includes("Data Name") || rp.length > 1000
      console.log(`[content] Extended content beyond XML boilerplate: ${hasExtendedContent}`)
      expect(hasExtendedContent).toBe(true)
    }
  })
})

describe("Non-PowerShell EVTX parsing (sanity check)", () => {
  it("Sysmon EVTX parses without truncation using Python-on-SIFT", async () => {
    const { stdout: sysmonFl } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "Sysmon%4Operational.evtx" | head -5`,
      90_000
    )
    const sysmonMatch = sysmonFl.match(/(\d+)-\d+-\d+:\s/)
    if (!sysmonMatch) {
      console.log("[sanity] No Sysmon EVTX found")
      return
    }
    const sysmonInode = sysmonMatch[1]

    const { stdout } = await sift(
      `sudo icat -o ${ntfsOffset} "${E01}" ${sysmonInode} > /tmp/test_sysmon2.evtx 2>/dev/null && \
evtxexport -f xml /tmp/test_sysmon2.evtx > /tmp/test_sysmon2.xml 2>/dev/null && \
python3 << 'PYEOF'
import re
from datetime import datetime

with open('/tmp/test_sysmon2.xml', 'r', errors='replace') as f:
    xml = f.read()

WINDOW_START = ${windowStartMs}
WINDOW_END = ${windowEndMs}

for block in re.split(r'(?=<Event[ >])', xml):
    if '<Event' not in block:
        continue
    eid_m = re.search(r'<EventID>(\\d+)</EventID>', block)
    ts_m = re.search(r'TimeCreated SystemTime="([^"]+)"', block)
    if not eid_m or not ts_m:
        continue
    try:
        ts_str = ts_m.group(1).replace('Z', '+00:00')
        ts_clean = re.sub(r'(\.\d{6})\d+', r'\1', ts_str)
        ts = datetime.fromisoformat(ts_clean)
        ts_ms = int(ts.timestamp() * 1000)
    except:
        continue
    if ts_ms < WINDOW_START or ts_ms > WINDOW_END:
        continue
    preview = block[:3000]
    print(f"EVENT|{eid_m.group(1)}|{len(preview)}|{preview[:80]}")

PYEOF`,
      180_000
    )

    const lines = stdout.split("\n").filter(l => l.startsWith("EVENT|"))
    console.log(`[sanity] Sysmon events parsed: ${lines.length}`)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines.slice(0, 5)) {
      const parts = line.split("|")
      console.log(`[sanity] Sysmon EID=${parts[1]} len=${parts[2]}`)
      expect(parseInt(parts[2], 10)).toBeGreaterThan(100)
    }
  }, 240_000)
})

afterAll(async () => {
  await sift("rm -f /tmp/test_ps.evtx /tmp/test_ps.xml /tmp/test_ps_parsed.json /tmp/test_sysmon2.evtx /tmp/test_sysmon2.xml 2>/dev/null")
  await unmountEvidenceFromSift(null, null, { data: { path: PLAYBOOK } }, null)
  console.log("[cleanup] Evidence unmounted")
})
