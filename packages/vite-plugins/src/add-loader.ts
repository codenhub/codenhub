import type { Plugin } from "vite";

const LOADER_STYLES = `
  #page-loader {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background, #fafafa);
    transition: opacity 0.3s ease;
  }

  #page-loader.hidden {
    opacity: 0;
    pointer-events: none;
  }

  #page-loader .spinner {
    width: 2.5rem;
    height: 2.5rem;
    border: 4px solid var(--color-border, #d4d4d4);
    border-top-color: var(--color-primary, #0a0a0a);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LOADER_BODY = `
  <div id="page-loader" role="status" aria-label="Loading">
    <div class="spinner"></div>
  </div>
  <noscript>
    <style>
      #page-loader { display: none !important; }
    </style>
  </noscript>
  <script>
    window.addEventListener("load", function () {
      const loader = document.getElementById("page-loader");
      if (!loader) return;
      loader.classList.add("hidden");
      const fallback = setTimeout(function () { loader.remove(); }, 500);
      loader.addEventListener("transitionend", function () {
        clearTimeout(fallback);
        loader.remove();
      });
    });
  </script>
`;

export default function addLoaderPlugin(): Plugin {
  return {
    name: "vite-plugin-add-loader",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html: string) {
        const withStyle = html.replace("</head>", `<style>${LOADER_STYLES}</style>\n</head>`);
        return withStyle.replace(/<body([^>]*)>/, `<body$1>${LOADER_BODY}`);
      },
    },
  };
}
