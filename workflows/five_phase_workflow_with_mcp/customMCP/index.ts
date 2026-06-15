import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { $ } from "bun";

let cachedEvidencePath: string | null = null;
function getE01Path(): string {
  const path = cachedEvidencePath ?? process.env.EVIDENCE_PATH;
  if (!path) throw new Error("Evidence path not set. Call scan_disk_artifacts first or set EVIDENCE_PATH env var.");
  return `${path}/disk-image.E01`;
}
function getMemoryPath(): string {
  const path = cachedEvidencePath ?? process.env.EVIDENCE_PATH;
  if (!path) throw new Error("Evidence path not set. Call scan_disk_artifacts first or set EVIDENCE_PATH env var.");
  return `${path}/memory.dump`;
}

async function sift(cmd: string): Promise<string> {
  try {
    const result = await $`sudo su - sift -c ${cmd}`
      .quiet()
      .text();
    return result.trim();
  } catch (e: any) {
    throw new Error(`SIFT_CMD_ERROR: ${e.stderr ?? e.message ?? e}`);
  }
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

function maybeSetPath(args: any) {
  const evidencePath = args?.evidencePath;
  if (evidencePath && typeof evidencePath === "string") {
    if (evidencePath !== cachedEvidencePath) cachedOffset = null;
    cachedEvidencePath = evidencePath;
  }
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
Provide the evidencePath exactly as received in your session message (e.g. /home/sift/evidence/playbook-name).
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
Returns raw process tree output. Cross-reference with Sysmon Event 1 records to identify what executed.`,
      inputSchema: {
        type: "object",
        properties: {
          evidencePath: { type: "string", description: "Optional. Full path to the evidence directory if not already set." },
        },
        required: [],
      },
    },
    {
      name: "inspect_memory_regions",
      description: `Call after scan_process_list. Runs windows.malfind and windows.dlllist on given PIDs.
Returns raw volatility output for the caller to interpret. Corroboration only.`,
      inputSchema: {
        type: "object",
        properties: {
          pids: { type: "array", items: { type: "number" } },
          evidencePath: { type: "string", description: "Optional. Full path to the evidence directory if not already set." },
        },
        required: ["pids"],
      },
    },
    {
      name: "check_handle_table",
      description: `Call after inspect_memory_regions. Runs windows.handles filtered to Process-type objects.
Returns all handles referencing lsass.exe. The caller is responsible for interpreting access masks and attributing techniques.`,
      inputSchema: {
        type: "object",
        properties: {
          evidencePath: { type: "string", description: "Optional. Full path to the evidence directory if not already set." },
        },
        required: [],
      },
    },
    {
      name: "generate_report",
      description: `Final tool. Accepts the caller's correlated findings and structures them into a report scaffold.
The caller must supply all attribution — this tool does not interpret or pattern-match findings.`,
      inputSchema: {
        type: "object",
        properties: {
          correlatedFindings: {
            type: "object",
            description: "The agent's own attributed findings, keyed however the agent chooses.",
          },
          evidencePath: { type: "string", description: "Optional. Full path to the evidence directory if not already set." },
        },
        required: ["correlatedFindings"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  const handlers: Record<string, () => Promise<{ content: { type: "text"; text: string }[] }>> = {
    scan_disk_artifacts: async () => {
      const evidencePath = (args as any)?.evidencePath;
      if (!evidencePath || typeof evidencePath !== "string") {
        return ok(JSON.stringify({ error: "evidencePath is required" }));
      }
      if (evidencePath !== cachedEvidencePath) cachedOffset = null;
      cachedEvidencePath = evidencePath;

      let offset: number;
      try {
        offset = await getPartitionOffset();
      } catch (e: any) {
        return ok(JSON.stringify({ error: e.message }));
      }

      const sources: string[] = (args as any)?.sources ?? ["all"];
      const all = sources.includes("all");
      const results: Record<string, string> = { partitionOffsetSectors: String(offset) };

      try {
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
      } catch (e: any) {
        return ok(JSON.stringify({ error: e.message, partialResults: results }));
      }

      return ok(JSON.stringify({ evidencePath, e01: getE01Path(), offset, artifacts: results }, null, 2));
    },

    scan_process_list: async () => {
      maybeSetPath(args);
      let pstree: string;
      try {
        pstree = await vol3("windows.pstree");
      } catch (e: any) {
        return ok(JSON.stringify({ error: e.message, hint: "SSH connection failed or memory path not set" }));
      }
      return ok(JSON.stringify({
        source: "volatility3 windows.pstree",
        memoryPath: getMemoryPath(),
        note: "Point-in-time snapshot. EPROCESS creation times only. Disk artifacts are authoritative for timing. Interpret this output yourself.",
        fullOutput: pstree,
      }, null, 2));
    },

    inspect_memory_regions: async () => {
      maybeSetPath(args);
      const pids: number[] = (args as any)?.pids ?? [];
      if (pids.length === 0) return ok(JSON.stringify({ note: "No PIDs provided. Skipping." }));

      const results: Record<number, any> = {};
      for (const pid of pids) {
        try {
          const malfind = await vol3("windows.malfind", `--pid ${pid}`);
          const dlls = await vol3("windows.dlllist", `--pid ${pid}`);
          results[pid] = { malfind, dlls };
        } catch (e: any) {
          results[pid] = { error: e.message };
        }
      }
      return ok(JSON.stringify({
        source: "volatility3 windows.malfind + windows.dlllist",
        note: "Raw output. Corroboration only. Interpret loaded modules and memory regions yourself.",
        results,
      }, null, 2));
    },

    check_handle_table: async () => {
      maybeSetPath(args);
      let handles: string;
      try {
        handles = await vol3("windows.handles", "--object-type Process");
      } catch (e: any) {
        return ok(JSON.stringify({ error: e.message, hint: "SSH connection failed or memory path not set" }));
      }
      const lsassHandles = handles.split("\n").filter(line => line.toLowerCase().includes("lsass"));
      return ok(JSON.stringify({
        source: "volatility3 windows.handles",
        note: "Handles opened and closed before memory capture are not visible here. Security EventIDs 4656 and 4663 are authoritative for handle activity. Interpret access masks yourself.",
        allLsassHandles: lsassHandles,
      }, null, 2));
    },

    generate_report: async () => {
      maybeSetPath(args);
      const path = cachedEvidencePath ?? process.env.EVIDENCE_PATH;
      const correlatedFindings = (args as any)?.correlatedFindings ?? {};
      const report = {
        e01: path ? `${path}/disk-image.E01` : "not set",
        memoryDump: path ? `${path}/memory.dump` : "not set",
        note: "Reconstructed from artifact analysis only. No ground truth used. Only LSASS dump abilities reported.",
        findings: correlatedFindings,
        sections: {
          reconstructedTimeline: "Agent to populate chronologically",
          verifiedFindings: "Agent to populate — findings with two or more corroborating artifact sources",
          inferredFindings: "Agent to populate — findings with a single artifact source",
          unattributedArtifacts: "Agent to populate — artifacts that could not be tied to a specific technique",
          coverageGaps: "Agent to populate from COVERAGE GAP entries returned by scan_disk_artifacts",
          evidenceIntegrity: "E01 and memory dump accessed read-only.",
          knownDetectionLimits: [
            "Memory is a point-in-time snapshot. Processes and handles that exited before capture are not visible.",
            "Some techniques delete their dump file immediately after creation.",
            "Multiple dump files must each be attributed individually.",
            "Command line arguments are required to distinguish legitimate from malicious use of system binaries.",
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
console.error(`[customMCP] Started. Evidence path will be set by scan_disk_artifacts or EVIDENCE_PATH env var.`);