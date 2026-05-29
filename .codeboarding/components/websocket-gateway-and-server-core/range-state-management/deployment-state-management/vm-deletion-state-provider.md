---
component_id: 1.7.1.3
component_name: VM Deletion State Provider
---

# VM Deletion State Provider

## Component Description

Provides VM deletion tracking state consumed by the deployment pipeline to determine if VMs are being torn down during deployment.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 311-311)
```
  const onVMs = toDelete.filter((vm) => vm.poweredOn).map((vm) => vm.name)
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 305-305)
```
  const toDelete = data?.all ? vms : vms.filter((vm) => !vm.isRouter && !vm.name?.includes("attacker-kali"))
```


## Source Files:

- `server/range.js`

