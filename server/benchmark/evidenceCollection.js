import { $ } from "bun"
import { readdir, rm } from "node:fs/promises"

export function getHost() {
  const url = process.env.PROXMOX_HOST
  if (!url) throw new Error("PROXMOX_HOST not set")
  return new URL(url).hostname
}

export async function ensureEwfTools(host) {
  const result = await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "which ewfacquire || true"`.quiet().text()
  if (result.trim()) return
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "apt update -qq && apt install -y libewf-dev ewf-tools"`.quiet()
}

export async function collectMemoryDump(vmid, host, destDir) {
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "mkdir -p ${destDir}"`.quiet()
  await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} ${"printf 'dump-guest-memory " + destDir + "/" + vmid + "-memory.dump\\nquit\\n' | qm monitor " + vmid}`.quiet()

  const dumpPath = `${destDir}/${vmid}-memory.dump`
  const waitLoop = `prev=0
while true; do
  curr=$(stat -c%s ${dumpPath} 2>/dev/null || echo 0)
  [ "$curr" -eq "$prev" ] && [ "$curr" -gt 0 ] && break
  prev=$curr
  sleep 2
done
echo "size:$curr"`

  const size = await $`ssh -o StrictHostKeyChecking=accept-new root@${host} bash -c ${waitLoop}`.quiet().text()
  }

export async function collectDiskImage(vmid, host, destDir) {
  const config = (await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "qm config ${vmid}"`.quiet().text())
  const volume = [...config.matchAll(/(?:scsi|virtio|sata|ide)\d+:\s+([^,\s]+)/g)]
    .map(m => m[1])
    .find(v => v !== "none")
  if (!volume) throw new Error(`No disk found for VM ${vmid}`)
  const diskPath = (await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "pvesm path ${volume}"`.quiet().text()).trim()
  const diskSize = (await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "blockdev --getsize64 ${diskPath}"`.quiet().text()).trim()
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "mkdir -p ${destDir}"`.quiet()

  try {
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm suspend ${vmid}"`.quiet()

    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "( sleep 1800 && qm status ${vmid} | grep -q suspended && qm resume ${vmid} ) < /dev/null > /dev/null 2>&1 &"`.quiet()

    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "ewfacquire -u -c deflate:fast -t ${destDir}/disk-image -C case001 -D 'atomic-red-team scenario' -e examiner -E 001 -m fixed -M physical -f encase6 -S ${diskSize} ${diskPath}"`
  } finally {
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm resume ${vmid} 2>/dev/null || true"`.quiet()
  }

  }

export async function rsyncEvidence(remoteHost, vmid, playbookName, localBasePath = "./evidence") {
  const dest = `${localBasePath}/${playbookName}`
  await $`mkdir -p ${dest}`.quiet()

  await $`rsync --progress --partial root@${remoteHost}:/var/lib/vz/evidence/${playbookName}/${vmid}-memory.dump ${dest}/memory.dump`

  await $`rsync --progress --partial root@${remoteHost}:/var/lib/vz/evidence/${playbookName}/disk-image.E01 ${dest}/disk-image.E01`

  }

export async function cleanupRemote(host, playbookName) {
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "rm -rf /var/lib/vz/evidence/${playbookName}"`.quiet()
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

export async function collectEvidence({ playbookName, vmid = 107, overwrite = false }) {
  if (!playbookName) throw new Error("playbookName is required")

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

  await ensureEwfTools(host)
  await collectMemoryDump(vmid, host, REMOTE_DEST)
  await collectDiskImage(vmid, host, REMOTE_DEST)
  await rsyncEvidence(host, vmid, playbookName)
  await computeLocalHashes(playbookName)
  await cleanupRemote(host, playbookName)

  return { success: true, playbookName }
}
