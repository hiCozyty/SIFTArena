import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree"
import {
  Globe,
  Key,
  Lock,
  Shield,
  User,
  Users,
} from "lucide-react"

export function AttackerConfigUIDemo() {
  return (
    <div className="rounded-lg">
      <ResizablePanelGroup direction="horizontal" className="min-h-[400px]">
        <ResizablePanel minSize="15" maxSize="30">
          <div className="h-full overflow-auto">
            <TreeProvider
              defaultExpandedIds={["database", "users-table", "roles-table", "api"]}
            >
              <TreeView>
                <TreeNode nodeId="database">
                  <TreeNodeTrigger>
                    <TreeExpander hasChildren />
                    <TreeIcon hasChildren />
                    <TreeLabel>Database</TreeLabel>
                  </TreeNodeTrigger>
                  <TreeNodeContent hasChildren>
                    <TreeNode level={1} nodeId="users-table">
                      <TreeNodeTrigger>
                        <TreeExpander hasChildren />
                        <TreeIcon hasChildren />
                        <TreeLabel>Users</TreeLabel>
                      </TreeNodeTrigger>
                      <TreeNodeContent hasChildren>
                        <TreeNode level={2} nodeId="id-field">
                          <TreeNodeTrigger>
                            <TreeExpander />
                            <TreeIcon
                              icon={<Key className="h-4 w-4 text-yellow-500" />}
                            />
                            <TreeLabel>id</TreeLabel>
                          </TreeNodeTrigger>
                        </TreeNode>
                        <TreeNode level={2} nodeId="email-field">
                          <TreeNodeTrigger>
                            <TreeExpander />
                            <TreeIcon
                              icon={<Globe className="h-4 w-4 text-purple-500" />}
                            />
                            <TreeLabel>email</TreeLabel>
                          </TreeNodeTrigger>
                        </TreeNode>
                        <TreeNode isLast level={2} nodeId="password-field">
                          <TreeNodeTrigger>
                            <TreeExpander />
                            <TreeIcon
                              icon={<Lock className="h-4 w-4 text-red-500" />}
                            />
                            <TreeLabel>password</TreeLabel>
                          </TreeNodeTrigger>
                        </TreeNode>
                      </TreeNodeContent>
                    </TreeNode>
                    <TreeNode isLast level={1} nodeId="roles-table">
                      <TreeNodeTrigger>
                        <TreeExpander hasChildren />
                        <TreeIcon hasChildren />
                        <TreeLabel>Roles</TreeLabel>
                      </TreeNodeTrigger>
                      <TreeNodeContent hasChildren>
                        <TreeNode level={2} nodeId="admin-role">
                          <TreeNodeTrigger>
                            <TreeExpander />
                            <TreeIcon
                              icon={<Shield className="h-4 w-4 text-orange-500" />}
                            />
                            <TreeLabel>Admin</TreeLabel>
                          </TreeNodeTrigger>
                        </TreeNode>
                        <TreeNode isLast level={2} nodeId="user-role">
                          <TreeNodeTrigger>
                            <TreeExpander />
                            <TreeIcon
                              icon={<User className="h-4 w-4 text-blue-400" />}
                            />
                            <TreeLabel>User</TreeLabel>
                          </TreeNodeTrigger>
                        </TreeNode>
                      </TreeNodeContent>
                    </TreeNode>
                  </TreeNodeContent>
                </TreeNode>
                <TreeNode isLast nodeId="api">
                  <TreeNodeTrigger>
                    <TreeExpander hasChildren />
                    <TreeIcon hasChildren />
                    <TreeLabel>API</TreeLabel>
                  </TreeNodeTrigger>
                  <TreeNodeContent hasChildren>
                    <TreeNode level={1} nodeId="auth-endpoint">
                      <TreeNodeTrigger>
                        <TreeExpander />
                        <TreeIcon icon={<Lock className="h-4 w-4 text-red-500" />} />
                        <TreeLabel>Authentication</TreeLabel>
                      </TreeNodeTrigger>
                    </TreeNode>
                    <TreeNode isLast level={1} nodeId="users-endpoint">
                      <TreeNodeTrigger>
                        <TreeExpander />
                        <TreeIcon icon={<Users className="h-4 w-4 text-blue-500" />} />
                        <TreeLabel>Users Management</TreeLabel>
                      </TreeNodeTrigger>
                    </TreeNode>
                  </TreeNodeContent>
                </TreeNode>
              </TreeView>
            </TreeProvider>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={65}>
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Config details panel
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
