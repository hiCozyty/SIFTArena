"use client"

import { useState } from "react"
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandEmpty,
} from "@/components/ui/command"
import { Card, CardContent } from "@/components/ui/card"

const steps = [
  {
    title: "Step 1: Install Proxmox VE 9.1",
    content: (
      <>
        <p className="mb-3">
          Download the Proxmox VE 9.1 ISO Installer from{" "}
          <a
            href="https://www.proxmox.com/en/downloads/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            https://www.proxmox.com/en/downloads/
          </a>
        </p>
        <p className="text-sm text-muted-foreground">
          <strong>IMPORTANT:</strong> During installation, select{" "}
          <strong>ext4</strong> first, then convert to{" "}
          <strong>ZFS (RAID0)</strong> when prompted.
        </p>
      </>
    ),
  },
  {
    title: "Step 2: Install Ludus",
    content: (
      <>
        <p className="mb-3">
          SSH into your Proxmox machine and run the following commands as root:
        </p>
        <div className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 text-sm">
          <pre className="whitespace-pre-wrap">
            {`root@proxmox:~# echo "# disabled enterprise repo" > /etc/apt/sources.list.d/pve-enterprise.sources
root@proxmox:~# echo "# disabled enterprise repo" > /etc/apt/sources.list.d/ceph.sources
root@proxmox:~# apt update && apt install curl sudo ca-certificates
root@proxmox:~# curl --proto '=https' --tlsv1.2 -sSf https://ludus.cloud/install | bash
`}
          </pre>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          The installation process will reboot the computer several times.
        </p>
        <img
          src="https://docs.ludus.cloud/assets/images/ludus-install-e8d875bf8ca81aceceba9406d6281bf3.gif"
          alt="Ludus installation process"
          className="mb-3 max-w-full rounded-lg border"
        />
        <p className="text-xs text-muted-foreground italic">
          Source: docs.ludus.cloud
        </p>
      </>
    ),
  },
  {
    title: "Step 3: Get Ludus API Key",
    content: (
      <>
        <p className="mb-3">After installation, retrieve your API key:</p>
        <div className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 text-sm">
          <pre className="whitespace-pre-wrap">
            {`ludus-install-status

# You'll see output like:
# Initial admin credentials:
# userID: JD
# Proxmox username: john-doe
# Proxmox password: password
# Ludus Web username: john.doe@example.com
# Ludus Web password: password
# API key for user JD: JD._7Gx2T5kTUSD%uTWZ*lFi=Os6MpFR^OrG+yT94Xt

exit
export LUDUS_API_KEY=JD._7Gx2T5kTUSD%uTWZ*lFi=Os6MpFR^OrG+yT94Xt`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground">
          Copy the <strong>API key for user</strong> - you'll need this to
          configure your Ludus server.
        </p>
      </>
    ),
  },
  {
    title: "Step 4: Get Server IP Address",
    content: (
      <>
        <p className="mb-3">
          Check your network interfaces to get the IP address of the Ludus range
          server:
        </p>
        <div className="overflow-x-auto rounded-lg bg-muted p-3 text-sm">
          <pre className="whitespace-pre-wrap">ip a</pre>
        </div>
        <p className="text-sm text-muted-foreground">
          Note the IP address for your Ludus server - you'll need this along
          with the API key to configure the connection.
        </p>
      </>
    ),
  },
  {
    title: "Step 5: Copy SSH Key to Ludus Server",
    content: (
      <>
        <p className="mb-3">
          Copy your SSH public key to the Ludus server so you can connect without a password:
        </p>
        <div className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 text-sm">
          <pre className="whitespace-pre-wrap">
{`ssh-copy-id root@<LUDUS_SERVER_IP>`}
          </pre>
        </div>
        <p className="text-sm text-muted-foreground">
          If you don't have an SSH key yet, generate one first:
        </p>
        <div className="overflow-x-auto rounded-lg bg-muted p-3 text-sm">
          <pre className="whitespace-pre-wrap">
{`ssh-keygen -t ed25519`}
          </pre>
        </div>
      </>
    ),
  },
  {
    title: "Step 6: WireGuard Setup",
    content: (
      <>
        <p className="mb-3">Generate WireGuard configuration:</p>
        <div className="mb-3 overflow-x-auto rounded-lg bg-muted p-3 text-sm">
          <pre className="whitespace-pre-wrap">
            {`ludus user wireguard | tee ludus.conf

# This will output something like:
# [Interface]
# PrivateKey = KBxrT+PFLClI+uJo9a6XLm/b23vbqL5KmNQ5Ac6uwGI=
# Address = 198.51.100.2/32
#
# [Peer]
# PublicKey = 5nlDO6gtqVXI89xQNkd2c2L0US7RnPinbAlfiyWHHBM=
# Endpoint = 203.0.113.54:51820
# AllowedIPs = 10.2.0.0/16, 198.51.100.1/32
# PersistentKeepalive = 25`}
          </pre>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          On your local machine, import this WireGuard configuration (
          <code className="rounded bg-muted px-1">ludus.conf</code>) into the
          WireGuard GUI client or on the command line with{" "}
          <code className="rounded bg-muted px-1">wg-quick</code> and connect.
        </p>
        <p className="text-sm text-muted-foreground">
          Note: <code className="rounded bg-muted px-1">wg setconf</code> is not
          supported by this configuration. Now you can directly interact with
          range VMs as if you were on the same network.
        </p>
      </>
    ),
  },
]

export function LudusServerGuide({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)

  const isOpen =
    controlledOpen !== undefined ? controlledOpen : uncontrolledOpen
  const setIsOpen = onOpenChange || setUncontrolledOpen

  return (
    <>
      <CommandDialog open={isOpen} onOpenChange={setIsOpen}>
        <CommandList className="max-h-[80vh] overflow-y-auto">
          <CommandEmpty>
            <div className="py-0 text-center">
              <h2 className="text-lg font-semibold">
                Ludus Server Installation Guide
              </h2>
              <p className="text-center text-sm text-muted-foreground">
                For the complete official documentation, visit the{" "}
                <a
                  href="https://docs.ludus.cloud/docs/quick-start/install-ludus"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Ludus Installation Guide
                </a>
              </p>
            </div>
          </CommandEmpty>

          <CommandGroup heading="">
            <div className="space-y-2 px-2 pb-2">
              {steps.map((step) => (
                <Card
                  key={step.title}
                  className="rounded-4xl border py-3 !shadow-none !ring-0"
                >
                  <CardContent className="px-3 py-0">
                    <h3 className="mt-0 mb-0 text-center text-lg font-semibold">
                      {step.title}
                    </h3>
                    <div>{step.content}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
