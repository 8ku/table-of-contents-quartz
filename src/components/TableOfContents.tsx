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

    // 弹出栈中深度 >= 当前深度的节点
    let top = stack[stack.length - 1];
    while (top !== undefined && Number(top.entry.depth) >= depth) {
      stack.pop();
      top = stack[stack.length - 1];
    }

    if (top === undefined) {
      roots.push(node);
    } else {
      top.children.push(node);
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
/* 滚动联动脚本：进入 h2 章节（含其下 h3/h4）时展开，离开章节后收起    */
/* ------------------------------------------------------------------ */
const tocScrollScript = `
document.addEventListener("nav", () => {
  if (window.__tocScrollCleanup) {
    window.__tocScrollCleanup();
    window.__tocScrollCleanup = null;
  }

  const h2Headings = Array.from(
    document.querySelectorAll("article h2[id], .markdown-preview-view h2[id], main h2[id]")
  );
  if (h2Headings.length === 0) return;

  // 预先拿到每个 h2 的目录项子列表
  const entries = h2Headings.map((h2) => {
    const id = h2.id;
    const tocLink = document.querySelector(
      'ul.toc-content a[href="#' + CSS.escape(id) + '"]'
    );
    const li = tocLink ? tocLink.closest("li") : null;
    const sublist = li ? li.querySelector(":scope > ul.toc-sublist") : null;
    return { h2, sublist };
  });

  let ticking = false;

  const updateActive = () => {
    ticking = false;
    // 参考线：视口顶部往下 80px 的位置
    const refLine = 80;
    let activeIndex = -1;

    for (let i = 0; i < entries.length; i++) {
      const rect = entries[i].h2.getBoundingClientRect();
      // 找到最后一个顶部已经越过参考线的 h2
      if (rect.top <= refLine) {
        activeIndex = i;
      } else {
        break;
      }
    }

    // 如果还没滚到第一个 h2，activeIndex 为 -1，全部收起
    entries.forEach((entry, i) => {
      if (!entry.sublist) return;
      if (i === activeIndex) {
        entry.sublist.classList.add("expanded");
      } else {
        entry.sublist.classList.remove("expanded");
      }
    });
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateActive);
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  // 初次进入页面时也执行一次
  updateActive();

  window.__tocScrollCleanup = () => {
    window.removeEventListener("scroll", onScroll);
  };
});

document.addEventListener("nav", () => {
  window.addEventListener("beforeunload", () => {
    if (window.__tocScrollCleanup) {
      window.__tocScrollCleanup();
      window.__tocScrollCleanup = null;
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
