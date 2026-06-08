const CONTAINER_BACKENDS = {
  sift: {
    vncHost: "localhost",
    vncPort: 5901,
    vncUser: "sift",
    vncPass: "forensics",
    sshHost: "localhost",
    sshPort: 2222,
    sshUser: "sift",
    sshPass: "forensics",
    label: "SIFT Workstation",
  },
}

export function getContainerBackend(id) {
  return CONTAINER_BACKENDS[id] || null
}

export function getContainerBackends() {
  return CONTAINER_BACKENDS
}
