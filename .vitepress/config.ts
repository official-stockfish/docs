import { defineConfig, type DefaultTheme } from "vitepress";
import { getSidebar } from "vitepress-plugin-auto-sidebar";
import { addImageDimensions } from "./plugins/add-image-dimensions";
import { mirrorRemoteImages } from "./plugins/mirror-remote-images";
import { transformImagesToWebp } from "./plugins/transform-images-to-webp";

const fetchRemoteImages = process.argv.includes("--fetch-remote-images");
const transformImagesToWebpBuildEnd = transformImagesToWebp();

const sortSidebarItems = (
  items: DefaultTheme.SidebarItem[],
  sortCurrentLevel = true,
): DefaultTheme.SidebarItem[] =>
  {
    const sortedChildren = items.map((item) => ({
      ...item,
      items: item.items ? sortSidebarItems(item.items) : undefined,
    }));

    if (!sortCurrentLevel) return sortedChildren;

    return sortedChildren.sort((a, b) => {
      const aIsHome = a.text.toLowerCase() === "home";
      const bIsHome = b.text.toLowerCase() === "home";

      if (aIsHome || bIsHome) return aIsHome ? -1 : 1;

      return a.text.localeCompare(b.text, undefined, { sensitivity: "base" });
    });
  };

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Stockfish Docs",
  description: "Documentation, technical details, and frequent questions.",
  markdown: {
    languageAlias: {
      cuda: "c++",
    },
    config(md) {
      md.use(addImageDimensions);
    },
  },
  base: "/docs/",

  ignoreDeadLinks: true,

  lastUpdated: false,

  sitemap: {
    hostname: "https://official-stockfish.github.io/docs/",
    lastmodDateOnly: false,
  },

  // cleanUrls: true,

  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/docs/images/favicon.png",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/docs/images/favicon.png",
      },
    ],
    [
      "meta",
      {
        name: "google-site-verification",
        content: "BUbhUeIYVA6S3tlQb5MR8T65ovPoDAdCElz1USVbKRE",
      },
    ],
    ["meta", { name: "theme-color", content: "#2b6e44" }],
    ["meta", { name: "og:type", content: "website" }],
    ["meta", { name: "og:locale", content: "en" }],
    ["meta", { name: "og:site_name", content: "Stockfish Documentation" }],
    [
      "meta",
      {
        name: "og:image",
        content:
          "https://official-stockfish.github.io/docs/images/icon_128x128.webp",
      },
    ],
  ],

  themeConfig: {
    logo: { src: "/images/icon_128x128@2x.webp" },

    search: {
      provider: "local",
    },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "Docs", link: "/stockfish-wiki/Home" },
      { text: "Main Site", link: "https://stockfishchess.org/" },
      {
        text: "Fishtest",
        link: "https://tests.stockfishchess.org/",
      },
    ],

    sidebar: sortSidebarItems(getSidebar({
      contentRoot: ".",
      contentDirs: [
        { path: "stockfish-wiki", title: "Stockfish" },
        { path: "fishtest-wiki", title: "Fishtest" },
        { path: "nnue-pytorch-wiki", title: "NNUE-Pytorch" },
      ],
      collapsible: true,
      collapsed: false,
    }), false),

    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/official-stockfish/Stockfish",
      },
      {
        icon: "twitter",
        link: "https://twitter.com/stockfishchess",
      },
      {
        icon: "discord",
        link: "https://discord.gg/GWDRS3kU6R",
      },
    ],
  },
  buildEnd: transformImagesToWebpBuildEnd,
  vite: {
    plugins: [mirrorRemoteImages({ fetchNewImages: fetchRemoteImages })],
  },
});
