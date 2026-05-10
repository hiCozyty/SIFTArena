import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar"

const Example = () => (
  <Menubar>
    <MenubarMenu>
      <MenubarTrigger>File</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>New File</MenubarItem>
        <MenubarItem>Open</MenubarItem>
        <MenubarItem>Save</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
)

export default Example
