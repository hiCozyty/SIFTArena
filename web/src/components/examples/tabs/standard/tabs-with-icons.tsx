import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RiBankCardLine, RiNotificationLine, RiSettingsLine, RiUserLine } from "@remixicon/react"

const Example = () => (
  <Tabs className="w-full max-w-md" defaultValue="account">
    <TabsList>
      <TabsTrigger value="account">
        <RiUserLine />
        Account
      </TabsTrigger>
      <TabsTrigger value="billing">
        <RiBankCardLine />
        Billing
      </TabsTrigger>
      <TabsTrigger value="notifications">
        <RiNotificationLine />
        Notifications
      </TabsTrigger>
      <TabsTrigger value="settings">
        <RiSettingsLine />
        Settings
      </TabsTrigger>
    </TabsList>
    <TabsContent value="account">
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <RiUserLine className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Account</h3>
            <p className="text-muted-foreground text-sm">Manage your account settings</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Update your personal information, change your password, and manage your account
          preferences.
        </p>
      </div>
    </TabsContent>
    <TabsContent value="billing">
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <RiBankCardLine className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Billing</h3>
            <p className="text-muted-foreground text-sm">View and manage billing</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Access your invoices, update payment methods, and manage your subscription plan.
        </p>
      </div>
    </TabsContent>
    <TabsContent value="notifications">
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <RiNotificationLine className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Notifications</h3>
            <p className="text-muted-foreground text-sm">Configure notification preferences</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Choose which notifications you want to receive and how you'd like to be notified.
        </p>
      </div>
    </TabsContent>
    <TabsContent value="settings">
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <RiSettingsLine className="size-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Settings</h3>
            <p className="text-muted-foreground text-sm">Customize your experience</p>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Adjust application settings, privacy controls, and other preferences to customize your
          experience.
        </p>
      </div>
    </TabsContent>
  </Tabs>
)

export default Example
