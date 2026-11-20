import type {
  QuartzComponent,
  QuartzComponentProps,
  QuartzComponentConstructor,
} from "@quartz-community/types";
import { classNames } from "../util/lang";
import { i18n } from "../i18n";
import legacyStyle from "./styles/legacyToc.scss";
import modernStyle from "./styles/toc.scss";
// @ts-expect-error - inline script imported as string by esbuild loader
import script from "./scripts/toc.inline.ts";
import OverflowListFactory from "./OverflowList";
import { concatenateResources } from "../util/resources";

interface Options {
  layout: "modern" | "legacy";
}

const defaultOptions: Options = {
  layout: "modern",
};

/* ------------------------------------------------------------------ */
/* 把扁平的 toc 条目数组转换成嵌套树结构                               */
/* ------------------------------------------------------------------ */
interface TocNode {
  entry: Record<string, unknown>;
  children: TocNode[];
}

function buildTocTree(entries: Record<string, unknown>[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  for (const entry of entries) {
    const depth = Number(entry.depth);
    const node: TocNode = { entry, children: [] };

    while (stack.length > 0 && Number(stack[stack.length - 1].entry.depth) >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

/* 递归渲染一个目录节点及其子节点 */
function renderTocNodes(nodes: TocNode[]): unknown[] {
  return nodes.map((node) => {
    const slug = String(node.entry.slug);
    const depth = String(node.entry.depth);
    const text = String(node.entry.text);
    return (
      <li key={slug} class={`depth-${depth}`}>
        <a href={`#${slug}`} data-for={slug}>
          {text}
        </a>
        {node.children.length > 0 && (
          <ul class="toc-sublist">{renderTocNodes(node.children)}</ul>
        )}
      </li>
    );
  });
}

/* ------------------------------------------------------------------ */
/* 滚动联动脚本：监听正文 h2，滚动到时展开其子标题                     */
/* ------------------------------------------------------------------ */
const tocScrollScript = `
document.addEventListener("nav", () => {
  if (window.__tocScrollObserver) {
    window.__tocScrollObserver.disconnect();
    window.__tocScrollObserver = null;
  }

  const h2Headings = document.querySelectorAll("article h2[id], .markdown-preview-view h2[id], main h2[id]");
  if (h2Headings.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const id = entry.target.id;
        if (!id) return;

        const tocLink = document.querySelector(
          'ul.toc-content a[href="#' + CSS.escape(id) + '"]'
        );
        if (!tocLink) return;

        const li = tocLink.closest("li");
        if (!li) return;

        const sublist = li.querySelector(":scope > ul.toc-sublist");
        if (!sublist) return;

        if (entry.isIntersecting) {
          sublist.classList.add("expanded");
        }
      });
    },
    { rootMargin: "0px 0px -70% 0px", threshold: 0 }
  );

  h2Headings.forEach((h2) => observer.observe(h2));
  window.__tocScrollObserver = observer;
});

document.addEventListener("nav", () => {
  window.addEventListener("beforeunload", () => {
    if (window.__tocScrollObserver) {
      window.__tocScrollObserver.disconnect();
      window.__tocScrollObserver = null;
    }
  });
});
`;

let numTocs = 0;
export default ((opts?: Partial<Options>) => {
  const layout = opts?.layout ?? defaultOptions.layout;
  const { OverflowList, overflowListAfterDOMLoaded } = OverflowListFactory();
  const TableOfContents: QuartzComponent = (props: QuartzComponentProps) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { fileData, cfg } = props as any;
    if (!fileData?.toc) {
      return null;
    }

    const id = `toc-${numTocs++}`;
    const tree = buildTocTree(fileData.toc);
    return (
      <div class={classNames("toc")}>
        <button
          type="button"
          class={fileData.collapseToc ? "collapsed toc-header" : "toc-header"}
          aria-controls={id}
          aria-expanded={!fileData.collapseToc}
        >
          <h3>{i18n(cfg.locale).components.tableOfContents.title}</h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="fold"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <OverflowList
          id={id}
          class={fileData.collapseToc ? "collapsed toc-content" : "toc-content"}
        >
          {renderTocNodes(tree)}
        </OverflowList>
        <style>{`
          ul.toc-content ul.toc-sublist {
            display: none;
            padding-left: 1rem;
            list-style: none;
          }
          ul.toc-content ul.toc-sublist.expanded {
            display: block;
          }
        `}</style>
      </div>
    );
  };

  TableOfContents.css = modernStyle;
  TableOfContents.afterDOMLoaded = concatenateResources(
    script,
    overflowListAfterDOMLoaded,
    tocScrollScript,
  ) as string;

  const LegacyTableOfContents: QuartzComponent = (props: QuartzComponentProps) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { fileData, cfg } = props as any;
    if (!fileData?.toc) {
      return null;
    }
    const tree = buildTocTree(fileData.toc);
    return (
      <details class="toc" open={!fileData.collapseToc}>
        <summary>
          <h3>{i18n(cfg.locale).components.tableOfContents.title}</h3>
        </summary>
        <ul>
          {fileData.toc.map((tocEntry: Record<string, unknown>) => {
            const slug = String(tocEntry.slug);
            const depth = String(tocEntry.depth);
            const text = String(tocEntry.text);
            return (
              <li key={slug} class={`depth-${depth}`}>
                <a href={`#${slug}`} data-for={slug}>
                  {text}
                </a>
              </li>
            );
          })}
        </ul>
      </details>
    );
  };
  LegacyTableOfContents.css = legacyStyle;

  return layout === "modern" ? TableOfContents : LegacyTableOfContents;
}) satisfies QuartzComponentConstructor<Partial<Options>>;
