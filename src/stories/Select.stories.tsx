import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const meta: Meta = {
  title: "UI/Select",
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj;

const fruits = ["Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape"];

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        {fruits.map((fruit) => (
          <SelectItem key={fruit} value={fruit.toLowerCase()}>
            {fruit}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="country-select">Country</Label>
      <Select>
        <SelectTrigger id="country-select" className="w-48">
          <SelectValue placeholder="Choose a country" />
        </SelectTrigger>
        <SelectContent>
          {["France", "Germany", "Japan", "United States", "Canada"].map(
            (country) => (
              <SelectItem key={country} value={country.toLowerCase().replace(" ", "-")}>
                {country}
              </SelectItem>
            )
          )}
        </SelectContent>
      </Select>
    </div>
  ),
};
