import { $ } from "bun"
import { readdir, rm, writeFile } from "node:fs/promises"
import { lastPlaybookResult } from "../playbook/runPlaybook.js"

export function getHost() {
  const url = process.env.PROXMOX_HOST
  if (!url) throw new Error("PROXMOX_HOST not set")
  return new URL(url).hostname
}

let evidenceAbortSignal = null
let currentEwfProc = null
let currentRsyncProc = null

export function abortEvidenceCollection() {
  if (evidenceAbortSignal) {
    evidenceAbortSignal.aborted = true
    }
  if (currentEwfProc) {
    currentEwfProc.kill()
  }
  if (currentRsyncProc) {
    currentRsyncProc.kill()
  }
}

function checkAbort(step) {
  if (evidenceAbortSignal?.aborted) {
    throw new Error("Collection aborted by user")
  }
}

export async function ensureEwfTools(host) {
  const result = await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "which ewfacquire || true"`.quiet().text()
  if (result.trim()) {
    return
  }
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "apt update -qq && apt install -y libewf-dev ewf-tools"`.quiet()
  }

export async function collectMemoryDump(vmid, host, destDir) {
  const safeDestDir = (await $`printf "%q" ${destDir}`.quiet().text()).trim()
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "mkdir -p ${safeDestDir}"`.quiet()

  const monitorCmd = `dump-guest-memory "${destDir}/${vmid}-memory.dump"`
  const monitorResult = await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "echo '${monitorCmd}' | qm monitor ${vmid}"`.text()
  const dumpPath = `${destDir}/${vmid}-memory.dump`
  const safeDumpPath = (await $`printf "%q" ${dumpPath}`.quiet().text()).trim()
  let prev = 0
  for (let i = 0; i < 300; i++) {
    checkAbort("memoryDump-poll")
    const size = (await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "stat -c%s ${safeDumpPath} 2>/dev/null || echo 0"`.quiet().text()).trim()
    if (size !== "0" && size === String(prev) && prev > 0) {
      break
    }
    prev = parseInt(size) || 0
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  }

export async function collectDiskImage(vmid, host, destDir, onProgress) {
  const config = (await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "qm config ${vmid}"`.quiet().text())
  const volume = [...config.matchAll(/(?:scsi|virtio|sata|ide)\d+:\s+([^,\s]+)/g)]
    .map(m => m[1])
    .find(v => v !== "none")
  if (!volume) throw new Error(`No disk found for VM ${vmid}`)
  const diskPath = (await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "pvesm path ${volume}"`.quiet().text()).trim()
  const diskSize = (await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "blockdev --getsize64 ${diskPath}"`.quiet().text()).trim()
  const safeDDPath = (await $`printf "%q" ${destDir}`.quiet().text()).trim()
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "mkdir -p ${safeDDPath}"`.quiet()

  let suspended = false
  try {
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm suspend ${vmid}"`.quiet()
    suspended = true
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "( sleep 1800 && qm status ${vmid} | grep -q suspended && qm resume ${vmid} ) < /dev/null > /dev/null 2>&1 &"`.quiet()

    const safeTarget = (await $`printf "%q" ${`${destDir}/disk-image`}`.quiet().text()).trim()
    const safeDesc = (await $`printf "%q" ${"atomic-red-team scenario"}`.quiet().text()).trim()
    const e01Cmd = `ewfacquire -u -c deflate:fast -t ${safeTarget} -C case001 -D ${safeDesc} -e examiner -E 001 -m fixed -M physical -f encase6 -S ${diskSize} ${diskPath}`
    const proc = Bun.spawn(["ssh", "-o", "StrictHostKeyChecking=accept-new", `root@${host}`, e01Cmd])
    currentEwfProc = proc

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        checkAbort("diskImage-acquire")
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (onProgress && trimmed.startsWith("Status:")) {
            onProgress(trimmed.replace(/\s+/g, " "))
          }
        }
      }
      await proc.exited
      if (proc.exitCode !== 0) {
        throw new Error(`ewfacquire failed with exit code ${proc.exitCode}`)
      }
      } finally {
      currentEwfProc = null
    }
  } finally {
    if (suspended) {
      const res = await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm resume ${vmid} 2>/dev/null || true"`.quiet().text()
      }
  }

  }

export async function rsyncEvidence(remoteHost, vmid, playbookName, localBasePath = "./evidence", onProgress) {
  const dest = `${localBasePath}/${playbookName}`
  const script = `#!/bin/bash
set -e
mkdir -p "${dest}"
echo "PROGRESS:memory.dump"
rsync --progress --partial "root@${remoteHost}:/var/lib/vz/evidence/${playbookName}/${vmid}-memory.dump" "${dest}/memory.dump"
echo "PROGRESS:DONE:memory.dump"
echo "PROGRESS:disk-image.E01"
rsync --progress --partial "root@${remoteHost}:/var/lib/vz/evidence/${playbookName}/disk-image.E01" "${dest}/disk-image.E01"
echo "PROGRESS:DONE:disk-image.E01"
`
  const scriptPath = `/tmp/rsync-evidence-${vmid}.sh`
  await Bun.write(scriptPath, script)
  await $`chmod +x ${scriptPath}`.quiet()

  const proc = Bun.spawn([scriptPath])
  currentRsyncProc = proc

  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      checkAbort("rsync-transfer")
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split(/\r?\n|\r/)
      buffer = parts.pop() || ""

      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue
        if (trimmed.startsWith("PROGRESS:")) {
          const msg = trimmed.slice("PROGRESS:".length)
          if (msg.startsWith("DONE:")) {
            if (onProgress) onProgress(`Completed ${msg.slice("DONE:".length)}`)
          } else {
            if (onProgress) onProgress(`Transferring ${msg}...`)
          }
        } else {
          if (onProgress) onProgress(trimmed)
        }
      }
    }
    await proc.exited
    if (proc.exitCode !== 0) {
      throw new Error(`rsync failed with exit code ${proc.exitCode}`)
    }
    } finally {
    currentRsyncProc = null
  }
  }

export async function cleanupRemote(host, playbookName) {
  const safePath = (await $`printf "%q" ${`/var/lib/vz/evidence/${playbookName}`}`.quiet().text()).trim()
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "rm -rf ${safePath}"`.quiet()
  }

export async function computeLocalHashes(playbookName, localBasePath = "./evidence") {
  const dest = `${localBasePath}/${playbookName}`
  const entries = await readdir(dest, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.endsWith(".sha256")) continue
    const filePath = `${dest}/${entry.name}`
    const shaPath = `${filePath}.sha256`
    if (await Bun.file(shaPath).exists()) {
      const hash = await Bun.file(shaPath).text()
      continue
    }
    const hasher = new Bun.CryptoHasher("sha256")
    const file = Bun.file(filePath)
    for await (const chunk of file.stream()) {
      hasher.update(chunk)
    }
    const hash = hasher.digest("hex")
    await Bun.write(shaPath, hash)
    }
}

async function evidenceExists(playbookName, localBasePath = "./evidence") {
  const memoryDump = Bun.file(`${localBasePath}/${playbookName}/memory.dump`)
  const diskImage = Bun.file(`${localBasePath}/${playbookName}/disk-image.E01`)
  return await memoryDump.exists() && await diskImage.exists()
}

export async function collectEvidence({ playbookName, vmid = 107, overwrite = false }, sendStatus) {
  if (!playbookName) throw new Error("playbookName is required")

  const abortSignal = { aborted: false }
  evidenceAbortSignal = abortSignal

  try {
    const host = getHost()
    const LOCAL_DIR = `./evidence/${playbookName}`
    const REMOTE_DEST = `/var/lib/vz/evidence/${playbookName}`
    const exists = await evidenceExists(playbookName)
    if (exists && !overwrite) {
      return { alreadyExists: true, playbookName }
    }

    if (exists && overwrite) {
      await rm(LOCAL_DIR, { recursive: true, force: true })
    }

    let currentStep = "ewfTools"
    try {
      checkAbort(currentStep)
      if (sendStatus) sendStatus("ewfTools", "running", "Installing EWF tools...")
      await ensureEwfTools(host)
      if (sendStatus) sendStatus("ewfTools", "success", "EWF tools ready")

      currentStep = "memoryDump"
      checkAbort(currentStep)
      if (sendStatus) sendStatus("memoryDump", "running", "Dumping VM memory...")
      await collectMemoryDump(vmid, host, REMOTE_DEST)
      if (sendStatus) sendStatus("memoryDump", "success", "Memory dump complete")

      currentStep = "diskImage"
      checkAbort(currentStep)
      if (sendStatus) sendStatus("diskImage", "running", "Suspending VM, collecting disk image...")
      await collectDiskImage(vmid, host, REMOTE_DEST, (msg) => {
        if (sendStatus) sendStatus("diskImage", "running", msg)
      })
      if (sendStatus) sendStatus("diskImage", "success", "Disk image collected")

      currentStep = "rsync"
      checkAbort(currentStep)
      if (sendStatus) sendStatus("rsync", "running", "Transferring evidence files...")
      await rsyncEvidence(host, vmid, playbookName, "./evidence", (msg) => {
        if (sendStatus) sendStatus("rsync", "running", msg)
      })
      if (sendStatus) sendStatus("rsync", "success", "Transfer complete")

      currentStep = "hashes"
      checkAbort(currentStep)
      if (sendStatus) sendStatus("hashes", "running", "Computing SHA256 hashes...")
      await computeLocalHashes(playbookName)
      if (sendStatus) sendStatus("hashes", "success", "Hashes computed")

      currentStep = "groundTruth"
      checkAbort(currentStep)
      if (sendStatus) sendStatus("groundTruth", "running", "Writing ground truth...")
      if (lastPlaybookResult) {
        await writeFile(`./groundTruth/${playbookName}/groundTruth.json`, JSON.stringify(lastPlaybookResult, null, 2))
        if (sendStatus) sendStatus("groundTruth", "success", "Ground truth written")
      } else {
        if (sendStatus) sendStatus("groundTruth", "success", "No playbook result to record")
      }

      currentStep = "cleanup"
      checkAbort(currentStep)
      if (sendStatus) sendStatus("cleanup", "running", "Cleaning up remote...")
      await cleanupRemote(host, playbookName)
      if (sendStatus) sendStatus("cleanup", "success", "Cleanup complete")

      return { success: true, playbookName }
    } catch (err) {
      console.error(`[evidence] collectEvidence error at step ${currentStep}: ${err.message}`)
      if (sendStatus) sendStatus(currentStep, "error", err.message)
      throw err
    }
  } finally {
    evidenceAbortSignal = null
  }
}
