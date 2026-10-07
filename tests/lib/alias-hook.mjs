/**
 * Module resolution hook for the unit test suite.
 *
 * `src/` modules import each other through the `@/*` alias declared in
 * tsconfig. Node has no idea about that mapping, so this hook translates
 * `@/x/y` into `<repo>/src/x/y` and appends the extension TypeScript lets
 * authors omit. It also covers extensionless *relative* imports between src
 * modules, which Node's ESM resolver rejects for the same reason.
 *
 * Registering is self-hosted: the same file is both the `--import` entry point
 * (main thread) and the hooks module (loader thread). The query string tells
 * the two apart so `register()` is only ever called once.
 *
 * Usage: node --experimental-strip-types --import ./tests/lib/alias-hook.mjs ...
 */
import { register } from "node:module";
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HOOK_QUERY = "shrinkfox-alias-hooks";

if (!import.meta.url.includes(HOOK_QUERY)) {
  register(`${import.meta.url}?${HOOK_QUERY}`);
}

const selfPath = fileURLToPath(import.meta.url.split("?")[0]);
const REPO_ROOT = path.resolve(path.dirname(selfPath), "..", "..");
const SRC_ROOT = path.join(REPO_ROOT, "src");

/** Tried in order; the first one that is a real file wins. */
const SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function firstExisting(basePath) {
  for (const suffix of SUFFIXES) {
    const candidate = basePath + suffix;
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@" || specifier.startsWith("@/")) {
    const target = firstExisting(path.join(SRC_ROOT, specifier.slice(2)));
    if (!target) {
      throw new Error(
        `alias-hook: cannot resolve "${specifier}" under ${SRC_ROOT}`,
      );
    }
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }

  // Extensionless relative imports (`./image`) used inside src/.
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const parent = context.parentURL;
      if (!parent || !parent.startsWith("file:")) throw error;
      const target = firstExisting(
        path.resolve(path.dirname(fileURLToPath(parent)), specifier),
      );
      if (!target) throw error;
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
