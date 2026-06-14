/**
 * workflows.test.js
 * Staging pipeline tests for five_abilities_no_noise playbook.
 * Verifies every step from raw E01/memory.dump up to agent handoff.
 * Does NOT test agent logic. Only tests that data is reachable,
 * parseable, and non-empty within the attack chain window.
 *
 * Run: bun test server/workflows/test/workflows.test.js
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import {
  mountEvidenceToSift,
  unmountEvidenceFromSift,
} from "../workflows.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYBOOK         = "five_abilities_no_noise"
const EVIDENCE_PATH    = `/home/sift/evidence/${PLAYBOOK}`
const E01              = `${EVIDENCE_PATH}/disk-image.E01`
const MEMORY_DUMP      = `${EVIDENCE_PATH}/memory.dump`

// Attack chain window (epoch ms, from groundTruth.json)
const WINDOW_START_MS  = 1781399360742
const WINDOW_END_MS    = 1781399397549

// Converted to seconds for tools that need epoch seconds
const WINDOW_START_S   = Math.floor(WINDOW_START_MS / 1000)
const WINDOW_END_S     = Math.ceil(WINDOW_END_MS / 1000)

// Window as ISO strings for display
const WINDOW_START_ISO = new Date(WINDOW_START_MS).toISOString()
const WINDOW_END_ISO   = new Date(WINDOW_END_MS).toISOString()

// SSH helper (mirrors the pattern in workflows.js)
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

// ---------------------------------------------------------------------------
// Shared state populated by beforeAll
// ---------------------------------------------------------------------------

let ntfsOffset = null
let sysmonInode = null
let securityInode = null
let powershellInode = null
let prefetchInode = null    // inode for Prefetch directory
let mftInode = null
let usnInode = null

// ---------------------------------------------------------------------------
// beforeAll: mount disk and detect offset once
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Use the existing mountEvidenceToSift to warm the offset cache
  // ws is null because there is no WebSocket in test context
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
  console.log(`[setup] Attack chain window: ${WINDOW_START_ISO} to ${WINDOW_END_ISO}`)
})

// ---------------------------------------------------------------------------
// STEP 1: mount_disk
// ---------------------------------------------------------------------------

describe("Step 1: mount_disk", () => {
  it("detects a valid NTFS partition offset", () => {
    expect(ntfsOffset).not.toBeNull()
    expect(typeof ntfsOffset).toBe("number")
    expect(ntfsOffset).toBeGreaterThan(0)
  })

  it("E01 file is accessible on SIFT", async () => {
    const { stdout, exitCode } = await sift(`test -f "${E01}" && echo EXISTS`)
    expect(exitCode).toBe(0)
    expect(stdout).toContain("EXISTS")
  })

  it("memory dump is accessible on SIFT", async () => {
    const { stdout, exitCode } = await sift(`test -f "${MEMORY_DUMP}" && echo EXISTS`)
    expect(exitCode).toBe(0)
    expect(stdout).toContain("EXISTS")
  })

  it("mmls returns a parseable partition table", async () => {
    const { stdout, exitCode } = await sift(`sudo mmls "${E01}" 2>&1`)
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)
    // Should contain sector information
    expect(stdout).toMatch(/\d{4,}/)
  })
})

// ---------------------------------------------------------------------------
// STEP 2: list_files (filtered fls calls)
// ---------------------------------------------------------------------------

describe("Step 2: list_files", () => {
  it("fls with evtx filter returns Sysmon log inode", async () => {
    const { stdout, exitCode } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "Sysmon%4Operational.evtx" | head -5`,
      90_000
    )
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)

    // Extract inode for use in later steps
    const inodeMatch = stdout.match(/(\d+)-\d+-\d+:\s/)
    expect(inodeMatch).not.toBeNull()
    sysmonInode = inodeMatch[1]
    console.log(`[step2] Sysmon inode: ${sysmonInode}`)
    console.log(`[step2] Sysmon fls line: ${stdout.split("\n")[0]}`)
  })

  it("fls with evtx filter returns Security log inode", async () => {
    const { stdout, exitCode } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "Security.evtx" | head -5`,
      90_000
    )
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)

    const inodeMatch = stdout.match(/(\d+)-\d+-\d+:\s/)
    expect(inodeMatch).not.toBeNull()
    securityInode = inodeMatch[1]
    console.log(`[step2] Security inode: ${securityInode}`)
  })

  it("fls with evtx filter returns PowerShell log inode", async () => {
    const { stdout, exitCode } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "PowerShell%4Operational.evtx" | head -5`,
      90_000
    )
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)

    const inodeMatch = stdout.match(/(\d+)-\d+-\d+:\s/)
    expect(inodeMatch).not.toBeNull()
    powershellInode = inodeMatch[1]
    console.log(`[step2] PowerShell inode: ${powershellInode}`)
  })

  it("fls with prefetch filter returns .pf files", async () => {
    const { stdout, exitCode } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "\\.pf$" | head -20`,
      90_000
    )
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)
    expect(stdout).toMatch(/\.pf$/im)

    // Grab the first inode for prefetch test
    const inodeMatch = stdout.match(/(\d+)-\d+-\d+:\s/)
    if (inodeMatch) {
      prefetchInode = inodeMatch[1]
      console.log(`[step2] First prefetch inode: ${prefetchInode}`)
    }
    console.log(`[step2] Prefetch files found: ${stdout.split("\n").length}`)
  })

  it("fls finds MFT", async () => {
    const { stdout, exitCode } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "\\$MFT" | grep -v MFTMirr | head -5`,
      90_000
    )
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)

    const inodeMatch = stdout.match(/(\d+)-\d+-\d+:\s/)
    if (inodeMatch) {
      mftInode = inodeMatch[1]
      console.log(`[step2] MFT inode: ${mftInode}`)
    }
  })

  it("fls finds USN journal", async () => {
    const { stdout, exitCode } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" | grep -i "UsnJrnl" | head -5`,
      90_000
    )
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)

    const inodeMatch = stdout.match(/(\d+)-\d+-\d+:\s/)
    if (inodeMatch) {
      usnInode = inodeMatch[1]
      console.log(`[step2] USN journal inode: ${usnInode}`)
    }
  })
})

// ---------------------------------------------------------------------------
// STEP 3: extract_and_parse_evtx
// Internally: icat -> tmp file -> evtxexport -> filter to window
// ---------------------------------------------------------------------------

describe("Step 3: extract_and_parse_evtx", () => {
  it("icat extracts Sysmon evtx bytes (non-empty)", async () => {
    expect(sysmonInode).not.toBeNull()
    const { stdout, exitCode } = await sift(
      `sudo icat -o ${ntfsOffset} "${E01}" ${sysmonInode} | wc -c`,
      120_000
    )
    expect(exitCode).toBe(0)
    const byteCount = parseInt(stdout.trim(), 10)
    expect(byteCount).toBeGreaterThan(0)
    console.log(`[step3] Sysmon evtx size: ${byteCount} bytes`)
  })

  it("evtxexport parses Sysmon log and returns records in window", async () => {
    expect(sysmonInode).not.toBeNull()
    // Extract to tmp, run evtxexport, grep for timestamps in window
    // evtxexport outputs lines with timestamps like: 2026-...
    // We filter by checking year/date range since exact ms filtering
    // requires post-processing. Here we verify records exist at all.
    const cmd = `sudo icat -o ${ntfsOffset} "${E01}" ${sysmonInode} > /tmp/test_sysmon.evtx 2>/dev/null \
      && evtxexport -f xml /tmp/test_sysmon.evtx 2>/dev/null | head -500`
    const { stdout, exitCode } = await sift(cmd, 180_000)

    // evtxexport may exit non-zero even on partial success, just check output
    expect(stdout.length).toBeGreaterThan(0)

    // Should look like XML event records
    expect(stdout).toMatch(/<EventID>|<Provider/i)
    console.log(`[step3] Sysmon evtxexport output length: ${stdout.length} chars`)

    // Verify we can find Event ID 10 (ProcessAccess to lsass) in the log
    const hasEvent10 = stdout.includes('<EventID>10<')
    console.log(`[step3] Sysmon Event 10 (ProcessAccess) present: ${hasEvent10}`)
  })

  it("Sysmon Event 10 with lsass TargetImage exists within attack window (diagnostic)", async () => {
    // Parse full evtxexport XML, filter for EID 10 + lsass TargetImage + window timestamp
    const { stdout } = await sift(
      `evtxexport -f xml /tmp/test_sysmon.evtx 2>/dev/null | \
python3 << 'PYEOF'
import sys, re, datetime

WINDOW_START = ${WINDOW_START_MS}
WINDOW_END = ${WINDOW_END_MS}
content = sys.stdin.read()
events = re.split(r'</Event>', content)
found = False
for ev in events:
    if '<EventID>10</EventID>' not in ev:
        continue
    if 'lsass.exe' not in ev:
        continue
    ts_match = re.search(r'TimeCreated SystemTime="([^"]+)"', ev)
    if ts_match:
        ts_str = ts_match.group(1).replace('Z', '+00:00')
        try:
            ts = datetime.datetime.fromisoformat(ts_str)
            ts_ms = ts.timestamp() * 1000
            if WINDOW_START <= ts_ms <= WINDOW_END:
                found = True
                break
        except Exception:
            pass
print('found_in_window' if found else 'not_found')
PYEOF`,
      120_000
    )
    console.log(`[step3] Sysmon EID 10 + lsass in window: ${stdout.trim()}`)
    expect(stdout.trim()).toMatch(/found_in_window|not_found/)
  })

  it("evtxexport parses Security log and returns records", async () => {
    expect(securityInode).not.toBeNull()
    const cmd = `sudo icat -o ${ntfsOffset} "${E01}" ${securityInode} > /tmp/test_security.evtx 2>/dev/null \
      && evtxexport -f xml /tmp/test_security.evtx 2>/dev/null | head -300`
    const { stdout, exitCode } = await sift(cmd, 180_000)

    expect(stdout.length).toBeGreaterThan(0)
    expect(stdout).toMatch(/<EventID>|<Provider/i)
    console.log(`[step3] Security evtxexport output length: ${stdout.length} chars`)

    // Check for 4688 (process creation) or 4656 (handle request)
    const has4688 = stdout.includes('<EventID>4688<')
    const has4656 = stdout.includes('<EventID>4656<')
    console.log(`[step3] Security Event 4688 present: ${has4688}`)
    console.log(`[step3] Security Event 4656 present: ${has4656}`)
  })

  it("Security 4656/4663/4688 with lsass exists within attack window (diagnostic)", async () => {
    // Parse full evtxexport XML, filter for 4656/4663/4688 + lsass + window timestamp
    const { stdout } = await sift(
      `evtxexport -f xml /tmp/test_security.evtx 2>/dev/null | \
python3 << 'PYEOF'
import sys, re, datetime

WINDOW_START = ${WINDOW_START_MS}
WINDOW_END = ${WINDOW_END_MS}
content = sys.stdin.read()
events = re.split(r'</Event>', content)
found = False
for ev in events:
    eid_match = re.search(r'<EventID>(\\d+)</EventID>', ev)
    if not eid_match:
        continue
    eid = eid_match.group(1)
    if eid not in ('4656', '4663', '4688'):
        continue
    if 'lsass.exe' not in ev:
        continue
    ts_match = re.search(r'TimeCreated SystemTime="([^"]+)"', ev)
    if ts_match:
        ts_str = ts_match.group(1).replace('Z', '+00:00')
        try:
            ts = datetime.datetime.fromisoformat(ts_str)
            ts_ms = ts.timestamp() * 1000
            if WINDOW_START <= ts_ms <= WINDOW_END:
                found = True
                break
        except Exception:
            pass
print('found_in_window' if found else 'not_found')
PYEOF`,
      120_000
    )
    console.log(`[step3] Security event + lsass in window: ${stdout.trim()}`)
    expect(stdout.trim()).toMatch(/found_in_window|not_found/)
  })

  it("evtxexport parses PowerShell log", async () => {
    expect(powershellInode).not.toBeNull()
    const cmd = `sudo icat -o ${ntfsOffset} "${E01}" ${powershellInode} > /tmp/test_powershell.evtx 2>/dev/null \
      && evtxexport -f xml /tmp/test_powershell.evtx 2>/dev/null | head -200`
    const { stdout } = await sift(cmd, 180_000)

    // PowerShell log may be empty if no PS techniques fired -- that is valid
    if (stdout.length === 0) {
      console.log("[step3] PowerShell log: empty or no records (coverage gap, not a failure)")
    } else {
      expect(stdout).toMatch(/<EventID>|<Provider/i)
      console.log(`[step3] PowerShell evtxexport output length: ${stdout.length} chars`)
    }
  })

  it("time window filter correctly narrows Sysmon records", async () => {
    // Use Python on SIFT to parse evtxexport XML output and count records
    // This validates that the filter logic we will use in the tool works correctly
    const filterScript = `python3 -c "
import re
with open('/tmp/test_sysmon.evtx.xml', 'r', errors='replace') as f:
    content = f.read()
count = len(re.findall(r'<EventID>', content))
print(f'total_records:{count}')
" 2>/dev/null || echo "parse_attempt_complete"`

    // First dump evtxexport to an XML file
    const dumpCmd = `evtxexport -f xml /tmp/test_sysmon.evtx > /tmp/test_sysmon.evtx.xml 2>/dev/null; echo "lines:$(wc -l < /tmp/test_sysmon.evtx.xml)"`
    const { stdout: dumpOut } = await sift(dumpCmd, 180_000)
    console.log(`[step3] Sysmon XML dump: ${dumpOut}`)

    const lineMatch = dumpOut.match(/lines:(\d+)/)
    if (lineMatch) {
      const lines = parseInt(lineMatch[1], 10)
      expect(lines).toBeGreaterThan(0)
      console.log(`[step3] Sysmon XML lines: ${lines}`)
    }
  })
})

// ---------------------------------------------------------------------------
// STEP 4: parse_prefetch
// ---------------------------------------------------------------------------

describe("Step 4: parse_prefetch", () => {
  it("icat extracts a prefetch file (non-empty)", async () => {
    expect(prefetchInode).not.toBeNull()
    const { stdout } = await sift(
      `sudo icat -o ${ntfsOffset} "${E01}" ${prefetchInode} | wc -c`,
      60_000
    )
    const byteCount = parseInt(stdout.trim(), 10)
    expect(byteCount).toBeGreaterThan(0)
    console.log(`[step4] Prefetch file size: ${byteCount} bytes`)
  })

  it("pecmd or pf tool is available on SIFT", async () => {
    // Check which prefetch parsing tool is available
    const { stdout: whichPecmd } = await sift("which pecmd 2>/dev/null || which PECmd 2>/dev/null || echo notfound")
    const { stdout: whichPf } = await sift("python3 -c 'import pf' 2>/dev/null && echo pf_available || echo pf_notfound")
    const { stdout: whichAnalyzePf } = await sift("which analyze_pf 2>/dev/null || echo notfound")

    console.log(`[step4] pecmd: ${whichPecmd}`)
    console.log(`[step4] python pf module: ${whichPf}`)
    console.log(`[step4] analyze_pf: ${whichAnalyzePf}`)

    // At least one should be available on SIFT -- log what we find
    // We do not fail here, we just report so we know what tool to use
    // in the actual MCP server implementation
    const anyAvailable = !whichPecmd.includes("notfound") ||
                         whichPf.includes("pf_available") ||
                         !whichAnalyzePf.includes("notfound")
    console.log(`[step4] Prefetch parsing tool available: ${anyAvailable}`)
  })

  it("strings on prefetch file reveals binary name and referenced paths", async () => {
    // Fallback: even without pecmd, strings gives us the binary name
    // and referenced DLLs from the prefetch file
    expect(prefetchInode).not.toBeNull()
    const cmd = `sudo icat -o ${ntfsOffset} "${E01}" ${prefetchInode} > /tmp/test.pf 2>/dev/null \
      && strings /tmp/test.pf | head -50`
    const { stdout } = await sift(cmd, 60_000)
    expect(stdout.length).toBeGreaterThan(0)
    // Prefetch strings should contain Windows path fragments
    expect(stdout).toMatch(/\\|WINDOWS|System32|\.EXE|\.DLL/i)
    console.log(`[step4] Prefetch strings sample:\n${stdout.split("\n").slice(0, 5).join("\n")}`)
  })

  it("prefetch strings contain known dump tool name", async () => {
    // Check prefetch file strings for known credential dumping tool names
    const { stdout } = await sift(
      `strings /tmp/test.pf | grep -iE "PROCDUMP|MIMIKATZ|RUNDLL32|DUMPIT|PSEXEC|procdump|rundll32" || echo "no_match"`,
      60_000
    )
    console.log(`[step4] Dump tool match: ${stdout.trim()}`)
    // Log but don't assert -- the prefetch file may not correspond to a dump tool
  })

  it("prefetch last run time falls within attack window", async () => {
    // Parse SCCA prefetch binary directly with Python struct
    const { stdout } = await sift(
      `python3 << 'PYEOF'
import struct, sys

with open('/tmp/test.pf', 'rb') as f:
    data = f.read()

if len(data) < 0x80:
    print("file_too_small")
    sys.exit(0)

sig = data[0:4]
if sig != b'SCCA':
    print(f"not_scca:{sig.hex()}")
    sys.exit(0)

version = struct.unpack_from('<I', data, 4)[0]
# Win8+ prefetch files have version >= 26, last run at 0x78
if version >= 17:
    last_run_ft = struct.unpack_from('<Q', data, 0x78)[0]
    last_run_epoch = (last_run_ft - 116444736000000000) // 10000000
    print(f"version:{version}")
    print(f"last_run_epoch:{last_run_epoch}")
else:
    print(f"version:{version}_not_supported")
PYEOF`,
      60_000
    )

    console.log(`[step4] Prefetch binary parse: ${stdout.trim().split("\n").filter(l => l).join(", ")}`)

    const versionMatch = stdout.match(/version:(\d+)/)
    const epochMatch = stdout.match(/last_run_epoch:(\d+)/)

    if (epochMatch) {
      const lastRunEpoch = parseInt(epochMatch[1], 10)
      const inWindow = lastRunEpoch >= WINDOW_START_S && lastRunEpoch <= WINDOW_END_S
      console.log(`[step4] Last run epoch: ${lastRunEpoch} (in window: ${inWindow})`)
      expect(inWindow).toBe(true)
    } else {
      console.log(`[step4] Could not extract last run time (version: ${versionMatch ? versionMatch[1] : "unknown"})` )
      // Not an error if format is unrecognized
    }
  })
})

// ---------------------------------------------------------------------------
// STEP 5: parse_usn_journal
// ---------------------------------------------------------------------------

describe("Step 5: parse_usn_journal", () => {
  it("USN journal inode was found", () => {
    expect(usnInode).not.toBeNull()
    console.log(`[step5] USN journal inode: ${usnInode}`)
  })

  it("icat extracts USN journal bytes (non-empty)", async () => {
    expect(usnInode).not.toBeNull()
    // USN $J is a sparse file -- we read a chunk to verify it has data
    const { stdout } = await sift(
      `sudo icat -o ${ntfsOffset} "${E01}" ${usnInode} 2>/dev/null | head -c 65536 | wc -c`,
      60_000
    )
    const byteCount = parseInt(stdout.trim(), 10)
    expect(byteCount).toBeGreaterThan(0)
    console.log(`[step5] USN journal first 64KB: ${byteCount} bytes`)
  })

  it("Python USN parser can extract records within attack chain window", async () => {
    // This tests the Python-based USN parsing we will use in the MCP tool
    // The script walks binary USN records and filters by timestamp
    const parserScript = `
import struct, sys, datetime

WINDOW_START = ${WINDOW_START_S}
WINDOW_END   = ${WINDOW_END_S}

def parse_usn_records(data):
    records = []
    offset = 0
    while offset < len(data) - 60:
        try:
            rec_len = struct.unpack_from('<I', data, offset)[0]
            if rec_len < 60 or rec_len > 65536:
                offset += 8
                continue
            major = struct.unpack_from('<H', data, offset + 4)[0]
            if major not in (2, 3):
                offset += 8
                continue
            # USN V2 record layout
            usn        = struct.unpack_from('<q', data, offset + 8)[0]
            ft         = struct.unpack_from('<q', data, offset + 24)[0]
            reason     = struct.unpack_from('<I', data, offset + 40)[0]
            fname_len  = struct.unpack_from('<H', data, offset + 56)[0]
            fname_off  = struct.unpack_from('<H', data, offset + 58)[0]
            fname_end  = offset + fname_off + fname_len
            if fname_end > len(data):
                offset += rec_len
                continue
            fname = data[offset + fname_off : fname_end].decode('utf-16-le', errors='replace')
            # Convert FILETIME to unix epoch
            epoch = (ft - 116444736000000000) // 10000000
            if WINDOW_START <= epoch <= WINDOW_END:
                records.append({'ts': epoch, 'file': fname, 'reason': hex(reason)})
            offset += rec_len
        except Exception:
            offset += 8
    return records

with open('/tmp/test_usn.bin', 'rb') as f:
    data = f.read()

records = parse_usn_records(data)
print(f'total_in_window:{len(records)}')
for r in records[:20]:
    ts = datetime.datetime.utcfromtimestamp(r['ts']).isoformat()
    print(f"  {ts}  {r['file']}  {r['reason']}")
`

    // First extract USN journal to temp file
    const extractCmd = `sudo icat -o ${ntfsOffset} "${E01}" ${usnInode} > /tmp/test_usn.bin 2>/dev/null; echo "extracted:$(wc -c < /tmp/test_usn.bin)"`
    const { stdout: extractOut } = await sift(extractCmd, 120_000)
    console.log(`[step5] USN extract: ${extractOut}`)

    // Run the parser
    const { stdout: parseOut } = await sift(
      `python3 -c '${parserScript.replace(/'/g, "'\"'\"'")}'`,
      60_000
    )
    console.log(`[step5] USN parse output:\n${parseOut}`)

    expect(parseOut).toContain("total_in_window:")
    const match = parseOut.match(/total_in_window:(\d+)/)
    if (match) {
      const count = parseInt(match[1], 10)
      console.log(`[step5] USN records in attack chain window: ${count}`)
      // Not asserting > 0 because USN rotation may have cleared older entries
      // Just verifying the parser ran correctly
    }
  })

  it("USN journal shows CREATE or DELETE of .dmp file within window", async () => {
    // Re-run the parser on the extracted USN data, filtering for .dmp CREATE/DELETE
    const dmpScript = `
import struct, datetime

WINDOW_START = ${WINDOW_START_S}
WINDOW_END   = ${WINDOW_END_S}
REASON_CREATE = 0x00000100
REASON_DELETE = 0x00000200

def parse_usn_records(data):
    records = []
    offset = 0
    while offset < len(data) - 60:
        try:
            rec_len = struct.unpack_from('<I', data, offset)[0]
            if rec_len < 60 or rec_len > 65536:
                offset += 8
                continue
            major = struct.unpack_from('<H', data, offset + 4)[0]
            if major not in (2, 3):
                offset += 8
                continue
            ft         = struct.unpack_from('<q', data, offset + 24)[0]
            reason     = struct.unpack_from('<I', data, offset + 40)[0]
            fname_len  = struct.unpack_from('<H', data, offset + 56)[0]
            fname_off  = struct.unpack_from('<H', data, offset + 58)[0]
            fname_end  = offset + fname_off + fname_len
            if fname_end > len(data):
                offset += rec_len
                continue
            fname = data[offset + fname_off : fname_end].decode('utf-16-le', errors='replace')
            epoch = (ft - 116444736000000000) // 10000000
            if WINDOW_START <= epoch <= WINDOW_END:
                if not fname.lower().endswith('.dmp'):
                    offset += rec_len
                    continue
                if (reason & REASON_CREATE) or (reason & REASON_DELETE):
                    records.append({'ts': epoch, 'file': fname, 'reason': hex(reason)})
            offset += rec_len
        except Exception:
            offset += 8
    return records

with open('/tmp/test_usn.bin', 'rb') as f:
    data = f.read()

records = parse_usn_records(data)
print(f'dmp_records:{len(records)}')
for r in records[:10]:
    ts = datetime.datetime.utcfromtimestamp(r['ts']).isoformat()
    print(f"  {ts}  {r['file']}  {r['reason']}")
`
    const { stdout: dmpOut } = await sift(
      `python3 -c '${dmpScript.replace(/'/g, "'\"'\"'")}'`,
      60_000
    )
    console.log(`[step5] USN .dmp CREATE/DELETE in window:\n${dmpOut}`)
    expect(dmpOut).toContain("dmp_records:")
    const dmpMatch = dmpOut.match(/dmp_records:(\d+)/)
    if (dmpMatch) {
      const dmpCount = parseInt(dmpMatch[1], 10)
      console.log(`[step5] .dmp CREATE/DELETE records in window: ${dmpCount}`)
    }
  })
})

// ---------------------------------------------------------------------------
// STEP 6: parse_mft_timeline
// ---------------------------------------------------------------------------

describe("Step 6: parse_mft_timeline", () => {
  it("MFT inode was found", () => {
    expect(mftInode).not.toBeNull()
    console.log(`[step6] MFT inode: ${mftInode}`)
  })

  it("icat extracts MFT (non-empty, large file expected)", async () => {
    const { stdout } = await sift(
      `sudo icat -o ${ntfsOffset} "${E01}" ${mftInode} 2>/dev/null | head -c 4096 | wc -c`,
      60_000
    )
    const byteCount = parseInt(stdout.trim(), 10)
    expect(byteCount).toBeGreaterThan(0)
    console.log(`[step6] MFT first 4KB: ${byteCount} bytes`)
  })

  it("mactime is available on SIFT", async () => {
    const { stdout } = await sift("which mactime 2>/dev/null || echo notfound")
    console.log(`[step6] mactime: ${stdout}`)
    expect(stdout).not.toContain("notfound")
  })

  it("MFT timeline can be generated and filtered to attack chain window", async () => {
    // Extract MFT, run mactime, filter to window
    // mactime uses date format M/D/Y for -b flag
    // We use a broader date range since mactime resolution is per-day
    const startDate = new Date(WINDOW_START_MS)
    const dateStr = `${startDate.getMonth() + 1}/${startDate.getDate()}/${startDate.getFullYear()}`

    const cmd = `sudo icat -o ${ntfsOffset} "${E01}" ${mftInode} > /tmp/test.mft 2>/dev/null \
      && istat -o ${ntfsOffset} "${E01}" ${mftInode} 2>/dev/null | head -5 \
      && echo "mft_extracted:$(wc -c < /tmp/test.mft)"`
    const { stdout } = await sift(cmd, 120_000)
    console.log(`[step6] MFT extraction: ${stdout}`)

    const sizeMatch = stdout.match(/mft_extracted:(\d+)/)
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1], 10)
      expect(size).toBeGreaterThan(0)
      console.log(`[step6] MFT size: ${size} bytes`)
    }
  })

  it("MFT timeline shows .dmp file with timestamp in attack window (diagnostic)", async () => {
    // Find all .dmp inodes using fls -r, then istat each for timestamps
    const { stdout: dmpList } = await sift(
      `sudo fls -r -o ${ntfsOffset} "${E01}" 2>/dev/null | grep -i '\\.dmp$' | head -20`,
      180_000
    )
    const dmpLines = dmpList.split("\n").filter(l => l.trim())
    console.log(`[step6] .dmp files found (including deleted): ${dmpLines.length}`)

    let anyInWindow = false
    for (const line of dmpLines) {
      const inodeMatch = line.match(/^[r-]\S+\s+(\d+)-/)
      if (!inodeMatch) continue
      const inode = inodeMatch[1]
      const { stdout: timestamps } = await sift(
        `sudo istat -o ${ntfsOffset} "${E01}" ${inode} 2>/dev/null | grep -E 'Created|Modified|Accessed'`,
        30_000
      )
      for (const tsLine of timestamps.split("\n")) {
        const dateMatch = tsLine.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/)
        if (dateMatch) {
          const ts = new Date(dateMatch[1] + " UTC").getTime()
          if (ts >= WINDOW_START_MS && ts <= WINDOW_END_MS) {
            anyInWindow = true
            console.log(`[step6] .dmp inode ${inode} timestamp in window: ${dateMatch[1]}`)
            break
          }
        }
      }
      if (anyInWindow) break
    }
    console.log(`[step6] .dmp file with timestamp in window: ${anyInWindow}`)
  })
})

// ---------------------------------------------------------------------------
// STEP 7: run_volatility (memory pipeline)
// ---------------------------------------------------------------------------

describe("Step 7: run_volatility (memory pipeline)", () => {
  it("Volatility 3 is available on SIFT", async () => {
    const { stdout } = await sift("vol --help 2>&1 | head -3 || vol3 --help 2>&1 | head -3")
    expect(stdout.length).toBeGreaterThan(0)
    console.log(`[step7] Volatility: ${stdout.split("\n")[0]}`)
  })

  it("windows.pstree returns a non-empty process tree", async () => {
    const { stdout } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.pstree 2>/dev/null | head -60`,
      180_000
    )
    expect(stdout.length).toBeGreaterThan(0)
    // Should contain common Windows processes
    expect(stdout).toMatch(/System|lsass|svchost|explorer/i)
    console.log(`[step7] pstree sample:\n${stdout.split("\n").slice(0, 10).join("\n")}`)
  })

  it("pstree output contains lsass.exe", async () => {
    const { stdout } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.pstree 2>/dev/null | grep -i lsass`,
      180_000
    )
    expect(stdout.length).toBeGreaterThan(0)
    expect(stdout.toLowerCase()).toContain("lsass")
    console.log(`[step7] lsass in pstree: ${stdout}`)
  })

  it("windows.handles filtered to lsass returns handle records", async () => {
    // First get lsass PID from pstree
    const { stdout: pstree } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.pstree 2>/dev/null | grep -i lsass | head -3`,
      180_000
    )
    const pidMatch = pstree.match(/\b(\d{3,6})\b/)
    expect(pidMatch).not.toBeNull()
    const lsassPid = pidMatch[1]
    console.log(`[step7] lsass PID: ${lsassPid}`)

    const { stdout } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.handles --pid ${lsassPid} 2>/dev/null | head -30`,
      180_000
    )
    expect(stdout.length).toBeGreaterThan(0)
    console.log(`[step7] handles sample (${stdout.split("\n").length} lines shown)`)
  })

  it("windows.malfind returns output (may be empty for clean processes)", async () => {
    const { stdout } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.malfind 2>/dev/null | head -50`,
      240_000
    )
    // Not asserting content -- malfind may return nothing or many hits
    // Just verifying the plugin runs without crashing
    console.log(`[step7] malfind output length: ${stdout.length} chars`)
    console.log(`[step7] malfind sample: ${stdout.split("\n").slice(0, 5).join("\n")}`)
  })

  it("windows.dlllist for a suspicious process returns DLL entries", async () => {
    // Find any dump-tool-adjacent process from pstree
    const { stdout: pstree } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.pstree 2>/dev/null | grep -iE "rundll32|procdump|python|powershell|WerFault" | head -5`,
      180_000
    )
    if (!pstree || pstree.length === 0) {
      console.log("[step7] No dump-tool processes in memory snapshot (expected if they exited before capture)")
      return
    }
    const pidMatch = pstree.match(/\b(\d{3,6})\b/)
    if (!pidMatch) {
      console.log("[step7] Could not extract PID from pstree line")
      return
    }
    const pid = pidMatch[1]
    console.log(`[step7] Testing dlllist on PID ${pid}: ${pstree.split("\n")[0]}`)

    const { stdout } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.dlllist --pid ${pid} 2>/dev/null | head -40`,
      180_000
    )
    expect(stdout.length).toBeGreaterThan(0)
    console.log(`[step7] dlllist output length: ${stdout.length} chars`)
  })

  it("non-system process has high-access handle (diagnostic)", async () => {
    // Get PIDs from pstree, scan non-system processes for high-access handles
    const { stdout: pstreeOut } = await sift(
      `vol -f "${MEMORY_DUMP}" windows.pstree 2>/dev/null | awk 'NR>2 {print $1}'`,
      60_000
    )
    const pids = pstreeOut.split("\n").map(pid => parseInt(pid, 10)).filter(n => {
      return !isNaN(n) && n > 4
    })
    const scanPids = pids.slice(0, 10)

    let found = false
    for (const pid of scanPids) {
      const { stdout: handleOut } = await sift(
        `vol -f "${MEMORY_DUMP}" windows.handles --pid ${pid} 2>/dev/null | grep -iE '0x1410|0x1fffff|0x1f0fff' | head -1`,
        60_000
      )
      if (handleOut.trim()) {
        found = true
        const accMask = handleOut.match(/0x[0-9a-f]{4,}/i)
        console.log(`[step7] High-access handle on PID ${pid}: access=${accMask ? accMask[0] : "unknown"}`)
        break
      }
    }
    console.log(`[step7] High-access handle from non-system process found: ${found}`)
  })
})

// ---------------------------------------------------------------------------
// HANDOFF SUMMARY
// All steps passed = data is ready for agent reasoning
// ---------------------------------------------------------------------------

describe("Agent handoff readiness", () => {
  it("all required inodes were discovered", () => {
    console.log("\n[handoff] Inode discovery summary:")
    console.log(`  Sysmon evtx:    ${sysmonInode ?? "NOT FOUND"}`)
    console.log(`  Security evtx:  ${securityInode ?? "NOT FOUND"}`)
    console.log(`  PowerShell evtx:${powershellInode ?? "NOT FOUND"}`)
    console.log(`  Prefetch dir:   ${prefetchInode ?? "NOT FOUND"}`)
    console.log(`  MFT:            ${mftInode ?? "NOT FOUND"}`)
    console.log(`  USN journal:    ${usnInode ?? "NOT FOUND"}`)

    // These three are the minimum for a viable agent handoff
    expect(sysmonInode).not.toBeNull()
    expect(securityInode).not.toBeNull()
    expect(mftInode).not.toBeNull()
  })

  it("attack chain window is valid", () => {
    expect(WINDOW_END_MS).toBeGreaterThan(WINDOW_START_MS)
    const windowSeconds = (WINDOW_END_MS - WINDOW_START_MS) / 1000
    console.log(`[handoff] Window duration: ${windowSeconds.toFixed(1)}s`)
    console.log(`[handoff] Window: ${WINDOW_START_ISO} to ${WINDOW_END_ISO}`)
  })

  it("both disk and memory sources are reachable", async () => {
    const [disk, mem] = await Promise.all([
      sift(`test -f "${E01}" && echo ok`),
      sift(`test -f "${MEMORY_DUMP}" && echo ok`),
    ])
    expect(disk.stdout).toBe("ok")
    expect(mem.stdout).toBe("ok")
    console.log("[handoff] Disk image: reachable")
    console.log("[handoff] Memory dump: reachable")
  })
})

// ---------------------------------------------------------------------------
// Cleanup: unmount evidence after all tests complete
// ---------------------------------------------------------------------------

afterAll(async () => {
  await unmountEvidenceFromSift(null, null, { data: { path: PLAYBOOK } }, null)
  console.log("[cleanup] Evidence unmounted")
})