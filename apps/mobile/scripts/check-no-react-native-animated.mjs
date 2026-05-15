import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["App.tsx", "src"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

const violations = [];

for (const sourceRoot of sourceRoots) {
  await scanPath(path.join(rootDir, sourceRoot));
}

if (violations.length > 0) {
  console.error(
    "Do not use Animated from react-native. Use react-native-reanimated for animation code."
  );
  for (const violation of violations) {
    console.error(`- ${path.relative(rootDir, violation.file)}:${violation.line} ${violation.reason}`);
  }
  process.exitCode = 1;
}

async function scanPath(filePath) {
  const entries = await safeReadDirectory(filePath);
  if (!entries) {
    await scanFile(filePath);
    return;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }

    await scanPath(path.join(filePath, entry.name));
  }
}

async function scanFile(filePath) {
  if (!sourceExtensions.has(path.extname(filePath))) {
    return;
  }

  const source = await readFile(filePath, "utf8");
  reportNamedReactNativeAnimatedImports(filePath, source);
  reportReactNativeAnimatedRequire(filePath, source);
}

function reportNamedReactNativeAnimatedImports(filePath, source) {
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*["']react-native["']/g;
  for (const match of source.matchAll(importPattern)) {
    const namedImports = match[1]
      .split(",")
      .map((item) => item.trim().split(/\s+as\s+/i)[0]?.trim())
      .filter(Boolean);

    if (namedImports.includes("Animated")) {
      violations.push({
        file: filePath,
        line: lineNumberForIndex(source, match.index ?? 0),
        reason: "imports Animated from react-native"
      });
    }
  }
}

function reportReactNativeAnimatedRequire(filePath, source) {
  const requirePatterns = [
    /\{\s*Animated\s*\}\s*=\s*require\(["']react-native["']\)/g,
    /require\(["']react-native["']\)\.Animated/g
  ];

  for (const pattern of requirePatterns) {
    for (const match of source.matchAll(pattern)) {
      violations.push({
        file: filePath,
        line: lineNumberForIndex(source, match.index ?? 0),
        reason: "requires Animated from react-native"
      });
    }
  }
}

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

async function safeReadDirectory(filePath) {
  try {
    return await readdir(filePath, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOTDIR") {
      return undefined;
    }

    throw error;
  }
}
