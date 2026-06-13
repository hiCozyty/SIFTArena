import { $ } from "bun"
import { readdir } from "node:fs/promises"

function getHost() {
  const url = process.env.PROXMOX_HOST
  if (!url) throw new Error("PROXMOX_HOST not set")
  return new URL(url).hostname
}

export async function ensureEwfTools(host) {
  const result = await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "which ewfacquire || true"`.quiet().text()
  if (result.trim()) return
  console.log("Installing ewf-tools on Proxmox host...")
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "apt update -qq && apt install -y libewf-dev ewf-tools"`.quiet()
}

export async function collectMemoryDump(vmid, host, destDir) {
  console.log(`Collecting memory dump for VM ${vmid}...`)
  const safeDestDir = (await $`printf "%q" ${destDir}`.quiet().text()).trim()
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} mkdir -p ${safeDestDir}`.quiet()
  await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} ${`printf 'dump-guest-memory "${destDir}/${vmid}-memory.dump"\nquit\n' | qm monitor ${vmid}`}`

  console.log("Waiting for memory dump to complete...")
  const dumpPath = `${destDir}/${vmid}-memory.dump`

  const safeDumpPath = (await $`printf "%q" ${dumpPath}`.quiet().text()).trim()
  let prev = 0
  for (let i = 0; i < 300; i++) {
    const result = await $`ssh -o StrictHostKeyChecking=accept-new root@${host} stat -c%s ${safeDumpPath} 2>/dev/null || echo 0`.quiet().text()
    const curr = parseInt(result.trim(), 10) || 0
    console.log(`  poll ${i}: ${curr} bytes`)
    if (curr === prev && curr > 0) break
    prev = curr
    await new Promise(r => setTimeout(r, 2000))
  }
  console.log(`  size:${prev}`)
}

export async function collectDiskImage(vmid, host, destDir, onProgress) {
  console.log(`Collecting disk image for VM ${vmid}...`)

  const config = (await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "qm config ${vmid}"`.quiet().text())
  const volume = [...config.matchAll(/(?:scsi|virtio|sata|ide)\d+:\s+([^,\s]+)/g)]
    .map(m => m[1])
    .find(v => v !== "none")
  if (!volume) throw new Error(`No disk found for VM ${vmid}`)
  console.log(`  Disk volume: ${volume}`)

  const diskPath = (await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "pvesm path ${volume}"`.quiet().text()).trim()
  console.log(`  Disk path: ${diskPath}`)

  const diskSize = (await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "blockdev --getsize64 ${diskPath}"`.quiet().text()).trim()
  console.log(`  Disk size: ${diskSize} bytes`)

  const safeDestDir = (await $`printf "%q" ${destDir}`.quiet().text()).trim()
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} mkdir -p ${safeDestDir}`.quiet()

  try {
    console.log("  Suspending VM...")
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm suspend ${vmid}"`.quiet()

    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "( sleep 1800 && qm status ${vmid} | grep -q suspended && qm resume ${vmid} ) < /dev/null > /dev/null 2>&1 &"`.quiet()

    const safeDiskImagePrefix = (await $`printf "%q" ${`${destDir}/disk-image`}`.quiet().text()).trim()
    const safeDesc = (await $`printf "%q" ${`atomic-red-team scenario`}`.quiet().text()).trim()
    console.log(`  Acquiring disk image to ${destDir}/disk-image.E01 (this may take a while)...`)
    const e01Cmd = `ewfacquire -u -c deflate:fast -t ${safeDiskImagePrefix} -C case001 -D ${safeDesc} -e examiner -E 001 -m fixed -M physical -f encase6 -S ${diskSize} ${diskPath}`
    const proc = Bun.spawn(["ssh", "-o", "StrictHostKeyChecking=accept-new", `root@${host}`, e01Cmd])

    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
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
    console.log("  Resuming VM...")
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm resume ${vmid} 2>/dev/null || true"`.quiet()
  }

  console.log("  Disk image acquired.")
}

export async function rsyncEvidence(remoteHost, vmid, playbookName, localBasePath = "./evidence", onProgress) {
  const dest = `${localBasePath}/${playbookName}`
  console.log(`Rsyncing evidence to ${dest}...`)

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

  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
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
  console.log("  Evidence synced.")
}

export async function cleanupRemote(host, playbookName) {
  console.log("Cleaning up remote evidence files...")
  const safePath = (await $`printf "%q" ${`/var/lib/vz/evidence/${playbookName}`}`.quiet().text()).trim()
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} rm -rf ${safePath}`.quiet()
  console.log("  Cleaned up.")
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
      console.log(`SHA256 for ${entry.name}: sha256:${hash.trim()}`)
      continue
    }
    console.log(`Computing SHA256 for ${entry.name}...`)
    const hasher = new Bun.CryptoHasher("sha256")
    const file = Bun.file(filePath)
    for await (const chunk of file.stream()) {
      hasher.update(chunk)
    }
    const hash = hasher.digest("hex")
    await Bun.write(shaPath, hash)
    console.log(`  sha256:${hash}`)
  }
}

if (import.meta.main) {
  const HOST = getHost()
  const VMID = 107
  const PLAYBOOK = "test playbook"
  const REMOTE_DEST = `/var/lib/vz/evidence/${PLAYBOOK}`
  const LOCAL_DIR = `./evidence/${PLAYBOOK}`

  console.log(`Host: ${HOST}, VMID: ${VMID}, Playbook: ${PLAYBOOK}\n`)

  const memoryDump = Bun.file(`${LOCAL_DIR}/memory.dump`)
  const diskImage = Bun.file(`${LOCAL_DIR}/disk-image.E01`)
  const evidenceExists = await memoryDump.exists() && await diskImage.exists()

  if (evidenceExists) {
    console.log("Evidence files already exist, skipping collection and transfer...")
  } else {
    await ensureEwfTools(HOST)
    await collectMemoryDump(VMID, HOST, REMOTE_DEST)
    await collectDiskImage(VMID, HOST, REMOTE_DEST)
    await rsyncEvidence(HOST, VMID, PLAYBOOK)
  }

  await computeLocalHashes(PLAYBOOK)

  if (!evidenceExists) {
    await cleanupRemote(HOST, PLAYBOOK)
  }

  console.log("\nDone.")
}