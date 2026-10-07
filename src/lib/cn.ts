/**
 * Minimal class-name joiner.
 *
 * Deliberately not `clsx` + `tailwind-merge`: the component layer below uses
 * explicit variant maps rather than prop-spread class overrides, so there are no
 * conflicting Tailwind classes to resolve and no reason to ship a resolver.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  const walk = (value: ClassValue) => {
    if (!value) return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const key in value) {
      if (value[key]) out.push(key);
    }
  };

  for (const input of inputs) walk(input);
  return out.join(" ");
}
