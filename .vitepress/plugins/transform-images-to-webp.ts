import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { SiteConfig } from "vitepress";

export interface TransformImagesToWebpOptions {
  quality?: number;
}

const DEFAULT_OPTIONS: Required<TransformImagesToWebpOptions> = {
  quality: 82,
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".xml",
]);

export function transformImagesToWebp(
  options: TransformImagesToWebpOptions = {},
): (siteConfig: SiteConfig) => Promise<void> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };

  return async (siteConfig) => {
    const outputDir = siteConfig.outDir;
    const files = await getFiles(outputDir);
    const images = files.filter((file) =>
      IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()),
    );

    if (images.length === 0) {
      return;
    }

    const replacements = new Map<string, string>();
    for (const image of images) {
      const webp = image.replace(/\.[^.]+$/, ".webp");
      await sharp(image).webp({ quality: resolved.quality }).toFile(webp);
      await unlink(image);

      // VitePress has already rendered pages, so update generated asset URLs
      // after replacing the output image files with WebP versions.
      addReplacementVariants(
        replacements,
        outputDir,
        siteConfig.site.base,
        image,
        webp,
      );
    }

    const textFiles = files.filter((file) =>
      TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()),
    );
    await Promise.all(
      textFiles.map((file) => rewriteReferences(file, replacements)),
    );
  };

  async function getFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? getFiles(file) : [file];
      }),
    );

    return nested.flat();
  }

  function addReplacementVariants(
    replacements: Map<string, string>,
    outputDir: string,
    base: string,
    image: string,
    webp: string,
  ) {
    const imagePath = toOutputPath(outputDir, image);
    const webpPath = toOutputPath(outputDir, webp);
    const baseImagePath = joinUrl(base, imagePath);
    const baseWebpPath = joinUrl(base, webpPath);

    replacements.set(imagePath, webpPath);
    replacements.set(`/${imagePath}`, `/${webpPath}`);
    replacements.set(baseImagePath, baseWebpPath);
  }

  function toOutputPath(outputDir: string, file: string) {
    return path.relative(outputDir, file).split(path.sep).join("/");
  }
}

async function rewriteReferences(
  file: string,
  replacements: Map<string, string>,
) {
  let source = await readFile(file, "utf8");
  let output = source;

  for (const [from, to] of replacements) {
    output = output.split(from).join(to);
  }

  if (output !== source) {
    await writeFile(file, output);
  }
}

function joinUrl(base: string, file: string) {
  return `${base.replace(/\/$/, "")}/${file}`;
}
