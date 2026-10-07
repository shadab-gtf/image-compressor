import { DoodleIcon } from "./doodle-icon";
import type { ToolIcon as ToolIconName } from "@/types/catalog";
export function ToolIcon({
  name,
  size = 56,
  className,
}: {
  name: ToolIconName;
  size?: number;
  className?: string;
}) {
  return <DoodleIcon name={name} size={size} className={className} />;
}
