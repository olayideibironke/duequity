import {
  existsSync,
} from "node:fs";

import path from "node:path";

import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

/**
 * DUEQUITY NODE RESOLUTION HOOK
 *
 * Lets zero-dependency Node scripts under scripts/ import the real production
 * server modules that use the "@/..." TypeScript path alias.
 *
 * Run scripts with:
 *
 *   node --experimental-strip-types --conditions=react-server \
 *     --import ./scripts/duequity-loader.mjs scripts/<script>.ts
 *
 * The react-server condition resolves the "server-only" marker package to its
 * empty entry point, exactly as the Next.js server build does.
 *
 * This hook performs no transformation and grants no extra capability. It only
 * maps the alias to a real file path.
 */

const scriptsDirectory =
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );

const repositoryRoot =
  path.resolve(
    scriptsDirectory,
    "..",
  );

const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".mjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

function resolveAliasTarget(
  specifier,
) {
  const base =
    path.join(
      repositoryRoot,
      "src",
      specifier.slice(
        2,
      ),
    );

  for (
    const suffix of CANDIDATE_SUFFIXES
  ) {
    const candidate =
      `${base}${suffix}`;

    if (
      existsSync(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  return undefined;
}

export async function resolve(
  specifier,
  context,
  nextResolve,
) {
  if (
    specifier.startsWith(
      "@/",
    )
  ) {
    const target =
      resolveAliasTarget(
        specifier,
      );

    if (
      target
    ) {
      return {
        shortCircuit:
          true,

        url:
          pathToFileURL(
            target,
          ).href,
      };
    }
  }

  return nextResolve(
    specifier,
    context,
  );
}

/**
 * Node's module customization hooks must be registered from a separate module
 * graph. Registering here keeps script invocation to a single --import flag.
 */
if (
  !process.env.DUEQUITY_LOADER_REGISTERED
) {
  const {
    register,
  } =
    await import(
      "node:module"
    );

  process.env.DUEQUITY_LOADER_REGISTERED =
    "1";

  register(
    import.meta.url,
  );
}
