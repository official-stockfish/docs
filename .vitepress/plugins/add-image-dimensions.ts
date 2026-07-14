import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

export interface AddImageDimensionsOptions {
  root?: string;
  publicDir?: string;
}

interface ImageDimensions {
  width: number;
  height: number;
}

const IMG_RE = /<img\b[^>]*>/gi;
const SRC_RE = /\bsrc=(['"])(.*?)\1/i;
const WIDTH_RE = /\bwidth=(['"])(.*?)\1/i;
const HEIGHT_RE = /\bheight=(['"])(.*?)\1/i;

export function addImageDimensions(
  md: MarkdownIt,
  options: AddImageDimensionsOptions = {},
) {
  const root = options.root ?? process.cwd();
  const publicDir = options.publicDir ?? path.join(root, "public");
  const dimensions = new Map<string, ImageDimensions | null>();

  md.core.ruler.after("inline", "add_image_dimensions", (state) => {
    for (const token of state.tokens) {
      annotateToken(token, state.env?.path);
    }
  });

  function annotateToken(token: Token, sourcePath?: string) {
    if (token.type === "image") {
      annotateImageToken(token, sourcePath);
      return;
    }

    if (token.type === "html_block" || token.type === "html_inline") {
      token.content = annotateHtmlImages(token.content, sourcePath);
      return;
    }

    for (const child of token.children ?? []) {
      annotateToken(child, sourcePath);
    }
  }

  function annotateImageToken(token: Token, sourcePath?: string) {
    const src = token.attrGet("src");
    if (!src || (token.attrGet("width") && token.attrGet("height"))) {
      return;
    }

    const imagePath = resolveImagePath(src, sourcePath);
    const size = imagePath ? getImageDimensions(imagePath, dimensions) : null;
    if (!size) {
      return;
    }

    const width = getNumericValue(token.attrGet("width"));
    const height = getNumericValue(token.attrGet("height"));

    if (width && !token.attrGet("height")) {
      token.attrSet(
        "height",
        String(Math.round((width / size.width) * size.height)),
      );
      return;
    }

    if (height && !token.attrGet("width")) {
      token.attrSet(
        "width",
        String(Math.round((height / size.height) * size.width)),
      );
      return;
    }

    if (!token.attrGet("width") && !token.attrGet("height")) {
      token.attrSet("width", String(size.width));
      token.attrSet("height", String(size.height));
    }
  }

  function annotateHtmlImages(source: string, sourcePath?: string) {
    return source.replace(IMG_RE, (tag) => {
      const src = getAttribute(tag, SRC_RE);
      if (!src || (hasAttribute(tag, "width") && hasAttribute(tag, "height"))) {
        return tag;
      }

      const imagePath = resolveImagePath(src, sourcePath);
      const size = imagePath ? getImageDimensions(imagePath, dimensions) : null;
      if (!size) {
        return tag;
      }

      const attrs = getMissingDimensionAttributes(tag, size);
      return attrs ? tag.replace(/^<img\b/i, `<img${attrs}`) : tag;
    });
  }

  function resolveImagePath(src: string, sourcePath?: string) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) {
      return null;
    }

    const cleanSrc = decodeSrc(src.split(/[?#]/, 1)[0]);
    if (cleanSrc.startsWith("/")) {
      return existingPath(path.join(publicDir, cleanSrc.slice(1)));
    }

    if (!sourcePath) {
      return null;
    }

    return existingPath(path.resolve(path.dirname(sourcePath), cleanSrc));
  }
}

function getImageDimensions(
  imagePath: string,
  cache: Map<string, ImageDimensions | null>,
) {
  if (cache.has(imagePath)) {
    return cache.get(imagePath) ?? null;
  }

  const size = readImageDimensions(imagePath);
  cache.set(imagePath, size);
  return size;
}

function readImageDimensions(imagePath: string): ImageDimensions | null {
  try {
    const size = imageSize(readFileSync(imagePath));
    return {
      width: size.width,
      height: size.height,
    };
  } catch {
    return null;
  }
}

function getAttribute(tag: string, pattern: RegExp) {
  return pattern.exec(tag)?.[2];
}

function hasAttribute(tag: string, name: string) {
  return new RegExp(`\\b${name}=`, "i").test(tag);
}

function getMissingDimensionAttributes(tag: string, size: ImageDimensions) {
  const hasWidth = hasAttribute(tag, "width");
  const hasHeight = hasAttribute(tag, "height");
  const width = getNumericValue(getAttribute(tag, WIDTH_RE));
  const height = getNumericValue(getAttribute(tag, HEIGHT_RE));

  if (width && !hasHeight) {
    return ` height="${Math.round((width / size.width) * size.height)}"`;
  }

  if (height && !hasWidth) {
    return ` width="${Math.round((height / size.height) * size.width)}"`;
  }

  if (!hasWidth && !hasHeight) {
    return ` width="${size.width}" height="${size.height}"`;
  }

  return "";
}

function getNumericValue(value: string | null | undefined) {
  const match = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(value?.trim() ?? "");
  return match ? Number(match[1]) : null;
}

function existingPath(filePath: string) {
  return existsSync(filePath) ? filePath : null;
}

function decodeSrc(src: string) {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}
