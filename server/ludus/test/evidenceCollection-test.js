import { $ } from "bun"

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
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "mkdir -p ${destDir}"`.quiet()
  await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} ${"printf 'dump-guest-memory " + destDir + "/" + vmid + "-memory.dump\\nquit\\n' | qm monitor " + vmid}`.quiet()

  console.log("Waiting for memory dump to complete...")
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
  console.log(`  ${size.trim()}`)
}

export async function collectDiskImage(vmid, host, destDir) {
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

  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "mkdir -p ${destDir}"`.quiet()

  try {
    console.log("  Suspending VM...")
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm suspend ${vmid}"`.quiet()

    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "( sleep 1800 && qm status ${vmid} | grep -q suspended && qm resume ${vmid} ) < /dev/null > /dev/null 2>&1 &"`.quiet()

    console.log(`  Acquiring disk image to ${destDir}/disk-image.E01 (this may take a while)...`)
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "ewfacquire -u -c deflate:fast -t ${destDir}/disk-image -C case001 -D 'atomic-red-team scenario' -e examiner -E 001 -m fixed -M physical -f encase6 -S ${diskSize} ${diskPath}"`
  } finally {
    console.log("  Resuming VM...")
    await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "qm resume ${vmid} 2>/dev/null || true"`.quiet()
  }

  console.log("  Disk image acquired.")
}

export async function rsyncEvidence(remoteHost, vmid, playbookName, localBasePath = "./evidence") {
  const dest = `${localBasePath}/${playbookName}`
  await $`mkdir -p ${dest}`.quiet()

  console.log(`Rsyncing memory dump to ${dest}/memory.dump...`)
  await $`rsync --progress --partial root@${remoteHost}:/var/lib/vz/evidence/${playbookName}/${vmid}-memory.dump ${dest}/memory.dump`

  console.log(`Rsyncing disk image to ${dest}/disk-image.E01...`)
  await $`rsync --progress --partial root@${remoteHost}:/var/lib/vz/evidence/${playbookName}/disk-image.E01 ${dest}/disk-image.E01`

  console.log("  Evidence synced.")
}

export async function cleanupRemote(host, playbookName) {
  console.log("Cleaning up remote evidence files...")
  await $`ssh -o StrictHostKeyChecking=accept-new root@${host} "rm -rf /var/lib/vz/evidence/${playbookName}"`.quiet()
  console.log("  Cleaned up.")
}

if (import.meta.main) {
  const HOST = getHost()
  const VMID = 107
  const PLAYBOOK = "test-playbook"
  const REMOTE_DEST = `/var/lib/vz/evidence/${PLAYBOOK}`

  console.log(`Host: ${HOST}, VMID: ${VMID}, Playbook: ${PLAYBOOK}\n`)

  await ensureEwfTools(HOST)
  await collectMemoryDump(VMID, HOST, REMOTE_DEST)
  await collectDiskImage(VMID, HOST, REMOTE_DEST)
  await rsyncEvidence(HOST, VMID, PLAYBOOK)
  await cleanupRemote(HOST, PLAYBOOK)

  console.log("\nDone.")
}