import crypto from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

export interface MirrorRemoteImagesOptions {
  outputDir?: string;
  include?: Array<string | RegExp>;
  failOnError?: boolean;
  fetchNewImages?: boolean;
}

type ResolvedOptions = Required<MirrorRemoteImagesOptions>;

const DEFAULT_INCLUDE: Array<string | RegExp> = [
  /^https?:\/\/(?:[^/]+\.)?(?:githubusercontent\.com|githubassets\.com|github\.com)\//i,
];

const DEFAULT_EXCLUDE_PREFIXES = [
  "https://github.com/official-stockfish/Stockfish/commit/",
  "https://tests.stockfishchess.org/tests",
  "https://github.com/official-stockfish/Stockfish/compare/",
  "https://github.com/official-stockfish/books/blob",
];

const DEFAULT_OPTIONS: ResolvedOptions = {
  outputDir: "images/external",
  include: DEFAULT_INCLUDE,
  failOnError: false,
  fetchNewImages: false,
};

const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".ico",
];

const MARKDOWN_IMAGE_RE =
  /!\[([^\]]*?)\]\((\s*https?:\/\/[^\s)]+)(?:\s+(".*?"|'.*?'|\([^)]+\)|[^)]+))?\s*\)/g;
const MARKDOWN_REFERENCE_IMAGE_RE = /!\[([^\]]*?)\]\[([^\]]*)\]/g;
const MARKDOWN_SHORTCUT_REFERENCE_IMAGE_RE = /!\[([^\]]+?)\](?!\s*[([])/g;
const REFERENCE_DEFINITION_RE =
  /^(\s*\[([^\]]+)\]:\s*)(https?:\/\/[^\s]+)(.*)$/gim;
const HTML_IMAGE_RE =
  /<img\b([^>]*?)\bsrc=(["'])(https?:\/\/[^"']+)\2([^>]*?)>/gi;

export function mirrorRemoteImages(
  options: MirrorRemoteImagesOptions = {},
): Plugin {
  const resolved: ResolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let publicDir = "";
  const cache = new Map<string, Promise<string>>();

  return {
    name: "vitepress-mirror-remote-images",
    enforce: "pre",
    configResolved(config) {
      publicDir = config.publicDir
        ? path.resolve(config.root, config.publicDir)
        : path.resolve(config.root, "public");
    },
    async transform(code, id) {
      if (!/\.md(?:$|\?)/i.test(id)) {
        return null;
      }

      const rewrittenMarkdown = await rewriteMarkdownImageSyntax(code);
      const rewrittenReferences =
        await rewriteReferenceDefinitions(rewrittenMarkdown);
      const rewrittenHtml = await rewriteHtmlImageSyntax(rewrittenReferences);

      if (rewrittenHtml === code) {
        return null;
      }

      return {
        code: rewrittenHtml,
        map: null,
      };
    },
  };

  async function rewriteMarkdownImageSyntax(source: string) {
    const matches = Array.from(source.matchAll(MARKDOWN_IMAGE_RE));
    if (matches.length === 0) {
      return source;
    }

    let output = source;
    for (const match of matches.reverse()) {
      const [fullMatch, altText, rawUrl, title] = match;
      const trimmedUrl = rawUrl.trim();
      const localUrl = await mirrorIfRemote(trimmedUrl);
      if (!localUrl || localUrl === trimmedUrl) {
        continue;
      }

      const replacement = `![${altText}](${localUrl}${title ? ` ${title}` : ""})`;
      output =
        output.slice(0, match.index ?? 0) +
        replacement +
        output.slice((match.index ?? 0) + fullMatch.length);
    }

    return output;
  }

  async function rewriteHtmlImageSyntax(source: string) {
    const matches = Array.from(source.matchAll(HTML_IMAGE_RE));
    if (matches.length === 0) {
      return source;
    }

    let output = source;
    for (const match of matches.reverse()) {
      const [fullMatch, beforeSrc, quote, rawUrl, afterSrc] = match;
      const localUrl = await mirrorIfRemote(rawUrl.trim());
      if (!localUrl || localUrl === rawUrl.trim()) {
        continue;
      }

      const replacement = `<img${beforeSrc}src=${quote}${localUrl}${quote}${afterSrc}>`;
      output =
        output.slice(0, match.index ?? 0) +
        replacement +
        output.slice((match.index ?? 0) + fullMatch.length);
    }

    return output;
  }

  async function rewriteReferenceDefinitions(source: string) {
    const matches = Array.from(source.matchAll(REFERENCE_DEFINITION_RE));
    if (matches.length === 0) {
      return source;
    }

    const imageReferenceLabels = getImageReferenceLabels(source);
    if (imageReferenceLabels.size === 0) {
      return source;
    }

    let output = source;
    for (const match of matches.reverse()) {
      const [fullMatch, prefix, label, rawUrl, suffix] = match;
      if (!imageReferenceLabels.has(normalizeReferenceLabel(label))) {
        continue;
      }

      const localUrl = await mirrorIfRemote(rawUrl.trim());
      if (!localUrl || localUrl === rawUrl.trim()) {
        continue;
      }

      const replacement = `${prefix}${localUrl}${suffix}`;
      output =
        output.slice(0, match.index ?? 0) +
        replacement +
        output.slice((match.index ?? 0) + fullMatch.length);
    }

    return output;
  }

  function getImageReferenceLabels(source: string) {
    const labels = new Set<string>();

    for (const match of source.matchAll(MARKDOWN_REFERENCE_IMAGE_RE)) {
      const [, altText, label] = match;
      labels.add(normalizeReferenceLabel(label || altText));
    }

    for (const match of source.matchAll(MARKDOWN_SHORTCUT_REFERENCE_IMAGE_RE)) {
      const [, label] = match;
      labels.add(normalizeReferenceLabel(label));
    }

    return labels;
  }

  async function mirrorIfRemote(url: string) {
    if (!isIncluded(url)) {
      return url;
    }

    const cached = cache.get(url);
    if (cached) {
      return cached;
    }

    const task = (async () => {
      const target =
        (await findExistingMirror(url)) ??
        (resolved.fetchNewImages
          ? await downloadRemoteImage(url)
          : url);
      return target;
    })();

    cache.set(url, task);
    return task;
  }

  function isIncluded(url: string) {
    if (!/^https?:\/\//i.test(url)) {
      return false;
    }

    if (DEFAULT_EXCLUDE_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return false;
    }

    return resolved.include.some((pattern) =>
      typeof pattern === "string" ? url.includes(pattern) : pattern.test(url),
    );
  }

  async function downloadRemoteImage(url: string) {
    console.log(`[vitepress-mirror-remote-images] Downloading ${url}...`);
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "user-agent": "vitepress-mirror-remote-images",
      },
    });

    if (!response.ok) {
      return handleDownloadFailure(
        `Failed to download ${url} (${response.status} ${response.statusText})`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return handleDownloadFailure(
        `Skipped ${url} because it returned ${contentType || "an unknown content type"}`,
      );
    }

    const relativePath = getMirrorPath(
      url,
      getExtension(url, contentType),
    );
    const absolutePath = path.join(publicDir, relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await stat(absolutePath);
    } catch {
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(absolutePath, buffer);
    }

    return `/${relativePath}`;
  }

  async function findExistingMirror(url: string) {
    for (const relativePath of getPossibleMirrorPaths(url)) {
      try {
        await stat(path.join(publicDir, relativePath));
        return `/${relativePath}`;
      } catch {
        // Keep looking for another extension.
      }
    }

    return null;
  }

  function getPossibleMirrorPaths(url: string) {
    const pathnameExtension = path.posix.extname(new URL(url).pathname);
    const extensions = pathnameExtension
      ? [pathnameExtension]
      : IMAGE_EXTENSIONS;
    return extensions.map((extension) =>
      getMirrorPath(url, extension),
    );
  }

  function getMirrorPath(url: string, extension: string) {
    const hash = crypto
      .createHash("sha1")
      .update(url)
      .digest("hex")
      .slice(0, 10);
    const parsed = new URL(url);
    const stem =
      sanitizeBaseName(path.posix.basename(parsed.pathname)) || "image";

    return path.posix.join(
      resolved.outputDir,
      parsed.hostname,
      `${stem}-${hash}${extension}`,
    );
  }

  function handleDownloadFailure(message: string) {
    if (resolved.failOnError) {
      throw new Error(message);
    }

    console.warn(`[vitepress-mirror-remote-images] ${message}`);
    return "";
  }
}

function normalizeReferenceLabel(label: string) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function sanitizeBaseName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getExtension(url: string, contentType: string) {
  const pathnameExtension = path.posix.extname(new URL(url).pathname);
  if (pathnameExtension) {
    return pathnameExtension;
  }

  const lowerContentType = contentType.toLowerCase();
  if (lowerContentType.includes("image/png")) {
    return ".png";
  }
  if (lowerContentType.includes("image/jpeg")) {
    return ".jpg";
  }
  if (lowerContentType.includes("image/webp")) {
    return ".webp";
  }
  if (lowerContentType.includes("image/gif")) {
    return ".gif";
  }
  if (lowerContentType.includes("image/svg+xml")) {
    return ".svg";
  }
  if (lowerContentType.includes("image/avif")) {
    return ".avif";
  }
  if (
    lowerContentType.includes("image/x-icon") ||
    lowerContentType.includes("image/vnd.microsoft.icon")
  ) {
    return ".ico";
  }

  return ".png";
}
