# Pre-Agent Handoff Pipeline – LSASS Detection (T1003.001)

## Overview

Two parallel forensic pipelines run after `mount_disk` (full disk image + memory dump). Each pipeline produces structured artifacts that feed into a correlation agent. The agent will later reconstruct the timeline of events and compare against ground truth.

---

## Disk Pipeline

| Artifact Source | Parser / Action | Captured Evidence |
|----------------|----------------|--------------------|
| Windows Event Logs (`*.evtx`) | `extract_and_parse_evtx` (x3: Security, Sysmon, PowerShell) | - Sysmon EID 1 (process creation – procdump, rundll32, etc.)<br>- Sysmon EID 10 (handle access to lsass.exe, `GrantedAccess` mask)<br>- Security EID 4656/4663 (handle requests to lsass)<br>- PowerShell ScriptBlock logs (if malicious commands ran) |
| USN Journal ($J) | `parse_usn_journal` | - Creation of `.dmp` files<br>- Modification of lsass-related files<br>- Deletion events (anti‑forensics) |
| Prefetch Files (`*.pf`) | `parse_prefetch` | - First and last 8 execution times of dump tools (procdump, mimikatz, etc.)<br>- Path to executable |
| Master File Table (`$MFT`) | `parse_mft_timeline` | - MACB timestamps for all relevant files (lsass.dmp, tool binaries)<br>- Baseline for timestomp detection |

### Disk Readiness (Applied by Ansible before attack)

- LSA Protection (RunAsPPL/RunAsPPLBoot) **disabled** (0)
- Process Creation command‑line logging enabled
- PowerShell ScriptBlock & Module logging enabled
- Sysmon installed with LSASS‑focused configuration
- USN Journal sized to 64 MB
- Event log channels resized (Security, Sysmon, PowerShell)

---

## Memory Pipeline

| Volatility Plugin | Target / PID | Captured Evidence |
|-------------------|--------------|--------------------|
| `pstree` | Full system | Parent‑child process tree – identify unusual processes spawned (e.g., rundll32 launching procdump) |
| `dlllist` | Suspicious PIDs (from pstree) | DLLs loaded into a process – detect reflective injection or unexpected modules (e.g., comsvcs.dll in a non‑expected binary) |
| `malfind` | Suspicious PIDs (from pstree) | Injected code sections (RWX memory regions) – indicates LSASS dumping via memory‑only techniques |
| `handles` | Suspicious PIDs (from pstree) | Open handles to lsass.exe – direct evidence of attempted process access |

---

## Correlation (Post‑Pipeline, Pre‑Agent)

The agent will combine outputs from both pipelines to reconstruct a unified timeline. Key correlation rules:

1. **Handle + File Write** – Volatility `handles` shows a process accessing lsass.exe **AND** USN journal shows a `.dmp` file created within seconds.
2. **Process Creation + Prefetch** – Sysmon EID 1 shows a dump tool executing **AND** Prefetch timestamp matches the same time window.
3. **Injection + Event Log** – `malfind` shows injected code in a process **AND** Sysmon EID 10 (ProcessAccess) targets lsass.exe from that same process.
4. **Anomaly Triangulation** – MFT, USN, and Prefetch disagree on a file’s last modified time → potential timestomping.

---

## Pipeline Output Format (to agent)

Each parser produces a JSON stream with at least:

- `timestamp` (UTC)
- `artifact_type` (evtx, usn, prefetch, mft, volatility_pstree, etc.)
- `source` (file path or memory offset)
- `details` (technique‑specific fields: process name, handle mask, DLL name, etc.)
- `correlation_id` (e.g., PID, file path, or event ID for agent to link)

---

## Known Limitations (Acceptable for LSASS detection scope)

- **Memory‑only, file‑less dumps** – still caught by `handles` + `malfind` + Sysmon EID 10.
- **USN journal deletion** – can be detected by parsing Security logs for `fsutil` commands; agent can flag missing journal as suspicious.
- **Timestomping** – MFT alone is unreliable; correlation with USN & Prefetch exposes inconsistencies.

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