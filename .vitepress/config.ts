import { defineConfig } from "vitepress";
import { getSidebar } from "vitepress-plugin-auto-sidebar";
import { addImageDimensions } from "./plugins/add-image-dimensions";
import { mirrorRemoteImages } from "./plugins/mirror-remote-images";
import { transformImagesToWebp } from "./plugins/transform-images-to-webp";

const fetchRemoteImages = process.argv.includes("--fetch-remote-images");
const transformImagesToWebpBuildEnd = transformImagesToWebp();

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
        type: "image/x-icon",
        href: "/docs/images/favicon.ico",
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

    sidebar: getSidebar({
      contentRoot: ".",
      contentDirs: ["stockfish-wiki", "fishtest-wiki", "nnue-pytorch-wiki"],
      collapsible: true,
      collapsed: false,
    }),

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
