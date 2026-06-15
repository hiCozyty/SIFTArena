# Pre-Agent Handoff Pipeline – LSASS Detection (T1003.001)

## Overview

The `preAgentStagingPipeline` extracts and stages forensic artifacts from a disk image (E01) and memory dump after evidence collection. Output lands in `/home/sift/evidence/{playbook}/staged/`. The attack window is derived from `groundTruth.json` with a ±5s buffer applied to catch events at the edges of ability execution.

---

## Attack Window

If `attackWindowStartMs` / `attackWindowEndMs` are provided by the caller, they are used directly. Otherwise the window is extracted from `groundTruth.json` (priority: `attackStart`/`attackEnd`, then `WINDOW_START_MS`/`WINDOW_END_MS`, then first/last timeline ability timestamps). A 5-second buffer is applied to all window comparisons (EVTX, USN, MFT, Prefetch).

---

## Disk Pipeline

| Artifact Source | Staged Output | Parsing Method | Captured Evidence |
|----------------|--------------|---------------|--------------------|
| Sysmon Operational EVTX | `sysmon.json` | `evtxexport -f xml`, regex extract EventID + TimeCreated | EID 1 (process creation), EID 10 (ProcessAccess to lsass.exe with `GrantedAccess` mask), plus any other event in the window. `rawPreview` clipped to 3000 chars. |
| Security EVTX | `security.json` | Same as above | EID 4656/4663 (handle requests to lsass) and any other event in window |
| PowerShell Operational EVTX | `powershell.json` | Same as above | ScriptBlock logs, module loads, pipeline execution events |
| USN Journal ($J) | `usn_journal.json` | Python struct parser (UTF-16-LE filenames, major version 2/3 only) | File create/modify/delete records with timestamp (epoch), filename, and reason flag (hex). Filtered to window. |
| Prefetch Files (`.pf`) | `prefetch.json` | `pyscca` (libscca-python) for all files, handling both compressed (MAM) and uncompressed (SCCA) formats natively. Filenames resolved via fls lookup. | Inode, filename (from fls), toolName, lastRunEpoch/UTC, allRunEpochs (up to 8 last run times), runCount. `inWindow` true if any epoch falls within the attack window. Capped at 50 files. |
| Master File Table ($MFT) | `mft_timeline.json` | `fls -m "C:"` piped to `mactime -d -y -b -` (CSV output). Filtered to window in JS via ISO8601 parsing. | Date (ISO8601), Size, Type, Meta, File Name. Capped at 200k rows. |
| Dump Files (`.dmp`) | `dump_files.json` | `fls -r` grep for `.dmp$` | Inode and filename for each dump file found (e.g. lsass.dmp). Used by downstream loading logic. |

### Disk Readiness (Applied by Ansible before attack)

- LSA Protection (RunAsPPL/RunAsPPLBoot) **disabled** (0)
- Process Creation command‑line logging enabled
- PowerShell ScriptBlock & Module logging enabled
- Sysmon installed with LSASS‑focused configuration
- USN Journal sized to 64 MB
- Event log channels resized (Security, Sysmon, PowerShell)

### Prefetch Notes

All prefetch files are parsed exclusively via `pyscca` (libscca-python), which handles both MAM (Xpress Huffman) compressed and uncompressed SCCA formats natively — no manual struct parsing or MAM detection needed. Up to 8 last run times are collected per file via `get_last_run_time_as_integer()`. A file is considered in-window if any of its run epochs fall within the attack window. Filenames are resolved from a separate `fls` pass to populate the `fileName` field.

---

## Memory Pipeline

| Volatility Plugin | Staged Output | Parsing Method | Captured Evidence |
|-------------------|--------------|----------------|--------------------|
| `windows.pstree` | `volatility_pstree.json` | Tab-delimited split. Header lines starting with "PID" or "Volatility" are skipped. Asterisk prefixes (tree indentation) are stripped. | `{ pid, ppid, name }` for every process |
| `windows.handles` (lsass.exe) | `volatility_handles_lsass.json` | Tab-delimited split (6+ fields). Header skipped via `.slice(1)`. | `{ pid, process, offset, handle, type, access, name }` — open handles from lsass.exe |
| `windows.handles` (non-system PIDs, top 20) | `volatility_high_access_handles.json` | Raw line match for high-access masks (`0x1410`, `0x1fffff`, `0x1f0fff`) | `{ pid, processName, handleInfo }` — suspicious handles from non-lsass, non-kernel processes |
| `windows.malfind` | `volatility_malfind.json` | Line filter for `PAGE_EXECUTE_READWRITE`, capped at 200 entries | Raw text lines showing RWX memory regions |
| `windows.dlllist` | `volatility_dlllist.json` | Run on suspicious PIDs (powershell, rundll32, procdump, python). `.slice(2, 50)` to skip headers. | `{ pid, processName, dlls: string[] }` — loaded DLLs per process |

---

## Correlation (Post‑Pipeline, Pre‑Agent)

The agent will combine outputs from both pipelines to reconstruct a unified timeline. Key correlation rules:

1. **Handle + File Write** – Volatility `handles` shows a process accessing lsass.exe **AND** USN journal shows a `.dmp` file created within seconds.
2. **Process Creation + Prefetch** – Sysmon EID 1 shows a dump tool executing **AND** Prefetch timestamp matches the same time window.
3. **Injection + Event Log** – `malfind` shows injected code in a process **AND** Sysmon EID 10 (ProcessAccess) targets lsass.exe from that same process.
4. **Anomaly Triangulation** – MFT, USN, and Prefetch disagree on a file's last modified time → potential timestomping.

---

## Manifest

A `manifest.json` is written alongside the staged outputs with the attack window (ms + ISO8601), NTFS partition offset, and artifact counts (sysmon/security/powershell events, USN records, MFT entries, prefetch files, processes, high-access handles). Generated timestamp is included.

---

## Known Limitations (Acceptable for LSASS detection scope)

- **Memory‑only, file‑less dumps** – still caught by `handles` + `malfind` + Sysmon EID 10.
- **USN journal deletion** – can be detected by parsing Security logs for `fsutil` commands; agent can flag missing journal as suspicious.
- **Timestomping** – MFT alone is unreliable; correlation with USN & Prefetch exposes inconsistencies.
- **Prefetch** – requires `pyscca` installed on SIFT. Errors are recorded per-file if `pyscca` fails to open or parse.
- **Comma-bearing filenames in MFT** – `mactime -d -y` outputs CSV; filenames containing commas may be split incorrectly by `parts.slice(7).join(",")`. Low-frequency issue.

---

## Final Readiness Check (Pre‑Attack Verification)

All checks must pass before running Atomic Red Team abilities:

- [x] RunAsPPL = 0 (LSA protection off)
- [x] Sysmon64 service running
- [x] ProcessCreationIncludeCmdLine_Enabled = 1
- [x] PowerShell ScriptBlock logging enabled
- [x] EnablePrefetcher ≥ 1
- [x] USN journal active on C:
- [x] AuditLevel for lsass.exe = 8
- [x] Handle Manipulation auditing = Success and Failure
- [x] DNS Client log enabled
- [x] PowerShell log max size ≥ 524 MB

> This pipeline is tailored exclusively for detecting LSASS credential dumping (T1003.001) and the common Atomic Red Team abilities (procdump, comsvcs.dll, mimikatz, PPLdump, etc.). No extra forensic modules are required.
