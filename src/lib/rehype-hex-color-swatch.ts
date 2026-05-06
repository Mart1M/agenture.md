/**
 * Inserts inline color swatches next to hex codes (#rgb, #rrggbb, #rrggbbaa) in markdown preview.
 * Skips content inside <pre> and <code>.
 */

type HastText = {
  type: "text";
  value: string;
};

type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children?: HastContent[];
};

type HastRoot = {
  type: "root";
  children: HastContent[];
};

type HastContent = HastText | HastElement | { type: string; [key: string]: unknown };

const HEX_HEAD = /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;

function normalizeHexCss(raw: string): string {
  const h = raw.slice(1);
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return raw.toLowerCase();
}

function parseHexFragments(text: string): HastContent[] | null {
  const parts: HastContent[] = [];
  let last = 0;
  let matched = false;
  let i = 0;

  while (i < text.length) {
    if (text[i] !== "#") {
      i++;
      continue;
    }

    const m = HEX_HEAD.exec(text.slice(i));
    if (!m) {
      i++;
      continue;
    }

    matched = true;
    if (i > last) {
      parts.push({ type: "text", value: text.slice(last, i) });
    }

    const token = m[0];
    const css = normalizeHexCss(token);

    parts.push({
      type: "element",
      tagName: "span",
      properties: {
        className: [
          "inline-flex",
          "items-center",
          "gap-1",
          "align-middle",
          "mx-0.5",
          "align-baseline",
        ],
        title: token,
      },
      children: [
        {
          type: "element",
          tagName: "span",
          properties: {
            className: [
              "inline-block",
              "size-3.5",
              "shrink-0",
              "rounded-full",
              "border",
              "border-border/50",
              "align-middle",
              "shadow-inner",
              "ring-1",
              "ring-black/5",
              "dark:ring-white/10",
            ],
            style: `background-color:${css}`,
          },
          children: [],
        },
        { type: "text", value: token },
      ],
    });

    const len = token.length;
    last = i + len;
    i = last;
  }

  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }

  return matched ? parts : null;
}

function spliceTextReplacements(children: HastContent[], inCode: boolean): void {
  for (let idx = 0; idx < children.length; idx++) {
    const node = children[idx];
    if (!node || typeof node !== "object" || !("type" in node)) continue;

    if (node.type === "text") {
      if (!inCode) {
        const t = node as HastText;
        const frag = parseHexFragments(t.value);
        if (frag) {
          children.splice(idx, 1, ...frag);
          idx += frag.length - 1;
        }
      }
      continue;
    }

    if (node.type === "element") {
      const el = node as HastElement;
      const nextIn =
        inCode || el.tagName === "pre" || el.tagName === "code";
      if (el.children?.length) {
        spliceTextReplacements(el.children, nextIn);
      }
    }
  }
}

export function rehypeHexColorSwatch() {
  return (tree: HastRoot | { children?: HastContent[] }) => {
    if (tree.children?.length) {
      spliceTextReplacements(tree.children, false);
    }
  };
}
