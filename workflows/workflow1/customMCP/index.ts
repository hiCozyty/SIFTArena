import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { $ } from "bun";

// Dynamic evidence path – set on first call to scan_disk_artifacts
let cachedEvidencePath: string | null = null;
function getE01Path(): string {
  if (!cachedEvidencePath) throw new Error("Evidence path not set. Call scan_disk_artifacts first.");
  return `${cachedEvidencePath}/disk-image.E01`;
}
function getMemoryPath(): string {
  if (!cachedEvidencePath) throw new Error("Evidence path not set. Call scan_disk_artifacts first.");
  return `${cachedEvidencePath}/memory.dump`;
}

async function sift(cmd: string): Promise<string> {
  const result = await $`sshpass -p forensics ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -n sift@localhost ${cmd}`
    .quiet()
    .text();
  return result.trim();
}

async function vol3(plugin: string, extra: string = ""): Promise<string> {
  const memPath = getMemoryPath();
  return sift(`vol -f "${memPath}" ${plugin} ${extra} 2>/dev/null`);
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

let cachedOffset: number | null = null;
async function getPartitionOffset(): Promise<number> {
  if (cachedOffset !== null) return cachedOffset;
  const e01 = getE01Path();
  const raw = await sift(
    `sudo mmls "${e01}" | grep -E 'Basic data|NTFS|ntfs' | sort -k5 -rn | head -1 | awk '{print $3}'`
  );
  const offset = parseInt(raw, 10);
  if (isNaN(offset)) throw new Error(`Could not detect NTFS partition offset. mmls output: ${raw}`);
  cachedOffset = offset;
  return offset;
}

async function extractEvtx(filename: string, offset: number): Promise<string> {
  const e01 = getE01Path();
  const inode = await sift(
    `sudo fls -r -o ${offset} "${e01}" | grep -i "${filename}" | head -1 | awk '{print $2}' | tr -d ':'`
  );
  if (!inode) return "";
  return sift(`sudo icat -o ${offset} "${e01}" ${inode} 2>/dev/null | strings | head -1000`);
}

const server = new Server(
  { name: "customMCP", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_disk_artifacts",
      description: `First tool. Extracts Sysmon, Security, Prefetch, USN Journal, and PowerShell logs from the E01.
IMPORTANT: Provide the evidencePath exactly as received in your session message (e.g. /home/sift/evidence/playbook-name).
The server will locate disk-image.E01 and memory.dump automatically.`,
      inputSchema: {
        type: "object",
        properties: {
          evidencePath: { type: "string", description: "Full path to the evidence directory." },
          sources: {
            type: "array",
            items: { type: "string", enum: ["sysmon", "security", "prefetch", "usn", "powershell", "all"] },
            description: "Which sources to extract. Defaults to all.",
          },
        },
        required: ["evidencePath"],
      },
    },
    {
      name: "scan_process_list",
      description: `Call after scan_disk_artifacts. Runs windows.pstree against the memory dump.
Flags processes matching known dump tool binaries. Cross-reference with Sysmon Event 1 records.`,
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "inspect_memory_regions",
      description: `Call after scan_process_list. Runs windows.malfind and windows.dlllist on given PIDs.
Corroboration only.`,
      inputSchema: {
        type: "object",
        properties: { pids: { type: "array", items: { type: "number" } } },
        required: ["pids"],
      },
    },
    {
      name: "check_handle_table",
      description: `Call after inspect_memory_regions. Runs windows.handles filtered to lsass targets.
Flags handles with dump-relevant access masks.`,
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "correlate_lsass_indicators",
      description: `Call after check_handle_table. Correlates all findings into technique clusters with confidence levels.
Only attribute actual LSASS dump abilities.`,
      inputSchema: {
        type: "object",
        properties: {
          findings: { type: "object", description: "Aggregated output from previous tools." },
        },
        required: ["findings"],
      },
    },
    {
      name: "generate_report",
      description: `Final tool. Produces a timeline of LSASS dump abilities (not noise) from artifact analysis only.
Sections: RECONSTRUCTED TIMELINE, VERIFIED FINDINGS, INFERRED FINDINGS, UNATTRIBUTED ARTIFACTS, COVERAGE GAPS, EVIDENCE INTEGRITY, KNOWN DETECTION LIMITS.`,
      inputSchema: {
        type: "object",
        properties: {
          correlatedFindings: { type: "object", description: "Output from correlate_lsass_indicators." },
        },
        required: ["correlatedFindings"],
      },
    },
  ],
}));

const DUMP_TOOL_NAMES = [
  "rundll32.exe", "procdump.exe", "procdump64.exe", "xordump.exe",
  "nanodump.x64.exe", "Outflank-Dumpert.exe", "createdump.exe",
  "WerFault.exe", "python.exe", "powershell.exe",
];

const TECHNIQUE_SIGNATURES = [
  { id: "comsvcs-rundll32", name: "comsvcs.dll via rundll32", mitre: "T1003.001", indicators: ["comsvcs.dll", "rundll32.exe", "MiniDump"] },
  { id: "xordump", name: "xordump (imported MS DLLs)", mitre: "T1003.001", indicators: ["xordump.exe", "dbghelp.dll", "dbgcore.dll"], note: "Deletes dump immediately. FileCreate plus FileDelete is expected." },
  { id: "createdump-dotnet", name: "createdump from .NET runtime", mitre: "T1003.001", indicators: ["createdump.exe", "dotnet"] },
  { id: "procdump-full", name: "ProcDump full dump (-ma)", mitre: "T1003.001", indicators: ["procdump.exe", "procdump64.exe", "-ma"] },
  { id: "procdump-mini", name: "ProcDump mini dump (-mm)", mitre: "T1003.001", indicators: ["procdump.exe", "procdump64.exe", "-mm"] },
  { id: "dumpert", name: "Outflank Dumpert (direct syscalls)", mitre: "T1003.001", indicators: ["Outflank-Dumpert.exe", "dumpert.dmp"] },
  { id: "nanodump", name: "NanoDump (invalid dump signature)", mitre: "T1003.001", indicators: ["nanodump.x64.exe", "nanodump.dmp"] },
  { id: "silent-process-exit", name: "SilentProcessExit via WerFault", mitre: "T1003.001", indicators: ["nanodump.x64.exe", "--silent-process-exit", "WerFault.exe", "SilentProcessExit"] },
  { id: "pypykatz", name: "pypykatz live LSA read", mitre: "T1003.001", indicators: ["pypykatz", "python.exe", "live lsa"] },
  { id: "out-minidump-ps1", name: "Out-Minidump.ps1 via PowerShell IEX", mitre: "T1003.001", indicators: ["Out-Minidump", "MiniDumpWriteDump", "powershell.exe", "IEX"] },
];

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const handlers: Record<string, () => Promise<{ content: { type: "text"; text: string }[] }>> = {
    scan_disk_artifacts: async () => {
      const evidencePath = (args as any)?.evidencePath;
      if (!evidencePath || typeof evidencePath !== "string") return ok(JSON.stringify({ error: "evidencePath is required" }));
      cachedEvidencePath = evidencePath;
      cachedOffset = null;
      let offset: number;
      try { offset = await getPartitionOffset(); } catch (e: any) { return ok(JSON.stringify({ error: e.message })); }

      const sources: string[] = (args as any)?.sources ?? ["all"];
      const all = sources.includes("all");
      const results: Record<string, string> = { partitionOffsetSectors: String(offset) };

      if (all || sources.includes("sysmon")) {
        results.sysmon = await extractEvtx("Microsoft-Windows-Sysmon%4Operational.evtx", offset);
        if (!results.sysmon) results.sysmon = "COVERAGE GAP: Sysmon log not found or empty";
      }
      if (all || sources.includes("security")) {
        results.security = await extractEvtx("Security.evtx", offset);
        if (!results.security) results.security = "COVERAGE GAP: Security log not found or empty";
      }
      if (all || sources.includes("prefetch")) {
        results.prefetch = await sift(`sudo fls -r -o ${offset} "${getE01Path()}" | grep -i "\\.pf$" | head -100`);
        if (!results.prefetch) results.prefetch = "COVERAGE GAP: No prefetch files found";
      }
      if (all || sources.includes("usn")) {
        results.usn = await sift(`sudo fls -r -o ${offset} "${getE01Path()}" | grep -i "UsnJrnl" | head -20`);
        if (!results.usn) results.usn = "COVERAGE GAP: USN Journal not found";
      }
      if (all || sources.includes("powershell")) {
        results.powershell = await extractEvtx("Microsoft-Windows-PowerShell%4Operational.evtx", offset);
        if (!results.powershell) results.powershell = "COVERAGE GAP: PowerShell log not found or empty";
      }
      return ok(JSON.stringify({ evidencePath, e01: getE01Path(), offset, artifacts: results }, null, 2));
    },

    scan_process_list: async () => {
      const pstree = await vol3("windows.pstree");
      const flagged = pstree.split("\n").filter(line => DUMP_TOOL_NAMES.some(n => line.toLowerCase().includes(n.toLowerCase())));
      return ok(JSON.stringify({ source: "volatility3 windows.pstree", memoryPath: getMemoryPath(), note: "Point-in-time snapshot. Timestamps are EPROCESS creation times. Disk artifacts are authoritative.", flaggedProcesses: flagged, fullOutput: pstree }, null, 2));
    },

    inspect_memory_regions: async () => {
      const pids: number[] = (args as any)?.pids ?? [];
      if (pids.length === 0) return ok(JSON.stringify({ note: "No PIDs provided. Skipping." }));
      const SUSPICIOUS_DLLS = ["dbghelp.dll", "dbgcore.dll", "comsvcs.dll"];
      const results: Record<number, any> = {};
      for (const pid of pids) {
        const malfind = await vol3("windows.malfind", `--pid ${pid}`);
        const dlls = await vol3("windows.dlllist", `--pid ${pid}`);
        results[pid] = { malfind, dlls, suspiciousDlls: SUSPICIOUS_DLLS.filter(d => dlls.toLowerCase().includes(d.toLowerCase())) };
      }
      return ok(JSON.stringify({ source: "volatility3 windows.malfind + windows.dlllist", note: "Corroboration only.", results }, null, 2));
    },

    check_handle_table: async () => {
      const handles = await vol3("windows.handles", "--object-type Process");
      const lsassHandles = handles.split("\n").filter(line => line.toLowerCase().includes("lsass"));
      const DUMP_ACCESS_MASKS = ["0x1fffff", "0x1010", "0x400"];
      const flagged = lsassHandles.filter(line => DUMP_ACCESS_MASKS.some(mask => line.toLowerCase().includes(mask.toLowerCase())));
      return ok(JSON.stringify({ source: "volatility3 windows.handles", note: "Handles opened/closed before capture not visible. Security 4656/4663 authoritative.", allLsassHandles: lsassHandles, flaggedDumpAccessHandles: flagged }, null, 2));
    },

    correlate_lsass_indicators: async () => {
      const findings = (args as any)?.findings ?? {};
      const findingsStr = JSON.stringify(findings).toLowerCase();
      const attributed = TECHNIQUE_SIGNATURES.map(sig => {
        const matched = sig.indicators.filter(ind => findingsStr.includes(ind.toLowerCase()));
        const confidence = matched.length >= 2 ? "HIGH" : matched.length === 1 ? "MEDIUM" : null;
        if (!confidence) return null;
        return { ...sig, matchedIndicators: matched, confidence };
      }).filter(Boolean);
      return ok(JSON.stringify({ attributed, note: "Only actual abilities. Pass to generate_report." }, null, 2));
    },

    generate_report: async () => {
      const correlatedFindings = (args as any)?.correlatedFindings ?? {};
      const report = {
        e01: cachedEvidencePath ? `${cachedEvidencePath}/disk-image.E01` : "not set",
        memoryDump: cachedEvidencePath ? `${cachedEvidencePath}/memory.dump` : "not set",
        note: "Reconstructed from artifact analysis only. No ground truth used. Only LSASS dump abilities reported.",
        sections: {
          reconstructedTimeline: "Agent to populate chronologically",
          verifiedFindings: (correlatedFindings?.attributed ?? []).filter((a: any) => a?.confidence === "HIGH"),
          inferredFindings: (correlatedFindings?.attributed ?? []).filter((a: any) => a?.confidence === "MEDIUM"),
          unattributedArtifacts: "Agent to populate",
          coverageGaps: "Agent to populate from COVERAGE GAP entries",
          evidenceIntegrity: "E01 and memory dump accessed read-only.",
          knownDetectionLimits: [
            "xordump deletes dump immediately — FileCreate plus FileDelete is expected signal",
            "Prereq DNS artifacts may precede technique execution",
            "Multiple .dmp files must be attributed per PID",
            "Technique-adjacent binaries require full command line analysis",
          ],
        },
      };
      return ok(JSON.stringify(report, null, 2));
    },
  };

  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler();
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[customMCP] Started. Evidence path will be set by scan_disk_artifacts.`);