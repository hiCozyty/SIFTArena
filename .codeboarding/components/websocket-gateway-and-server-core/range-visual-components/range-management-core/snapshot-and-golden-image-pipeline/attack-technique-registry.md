---
component_id: 1.6.2.2.2
component_name: Attack Technique Registry
---

# Attack Technique Registry

## Component Description

Provides MITRE ATT&CK technique data for snapshot validation; verifies Caldera connectivity during image preparation.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 764-778)
```
export async function checkCaldera(ludusUrl, apiKey, data, ws) {
  const { label } = data
  if (!label) throw new Error("label is required")

  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vm = findVM(range.VMs ?? [], label)
  const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForVMIP(ludusUrl, apiKey, vm.name)

  try {
  const result = await $`sshpass -p 'kali' ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 kali@${ip} "systemctl is-active caldera"`.quiet().text()
    return { calderaInstalled: result.trim() === "active" }
  } catch {
    return { calderaInstalled: false }
  }
}
```


