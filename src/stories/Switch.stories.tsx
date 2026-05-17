import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const meta: Meta<typeof Switch> = {
  title: "UI/Switch",
  component: Switch,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  argTypes: {
    disabled: { control: "boolean" },
    defaultChecked: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="notifications" />
      <Label htmlFor="notifications">Enable notifications</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Switch id="dark-mode" defaultChecked />
      <Label htmlFor="dark-mode">Dark mode</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Switch id="disabled-off" disabled />
        <Label htmlFor="disabled-off" className="opacity-50">
          Disabled off
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="disabled-on" disabled defaultChecked />
        <Label htmlFor="disabled-on" className="opacity-50">
          Disabled on
        </Label>
      </div>
    </div>
  ),
};

export const SettingsGroup: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-4">
      {[
        { id: "email-notifs", label: "Email notifications", checked: true },
        { id: "push-notifs", label: "Push notifications", checked: false },
        { id: "weekly-digest", label: "Weekly digest", checked: true },
        { id: "marketing", label: "Marketing emails", checked: false },
      ].map(({ id, label, checked }) => (
        <div key={id} className="flex items-center justify-between">
          <Label htmlFor={id}>{label}</Label>
          <Switch id={id} defaultChecked={checked} />
        </div>
      ))}
    </div>
  ),
};
