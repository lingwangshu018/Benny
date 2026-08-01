import type { BeautySettings } from "../types/beauty";
import { readJson, writeJson } from "./localStorage";

const KEY = "aether.beautySettings";
const CHANGE_EVENT = "aether-beauty-change";
const MAX_CSS_LENGTH = 30_000;

export const defaultBeautySettings: BeautySettings = {
  schemaVersion: 1,
  wallpaperReference: "",
  wallpaperPosition: "center",
  wallpaperDim: 0.08,
  desktopCss: "",
  chatCss: "",
  updatedAt: 0,
};

function normalize(source: Partial<BeautySettings> | null): BeautySettings {
  return {
    ...defaultBeautySettings,
    ...source,
    schemaVersion: 1,
    wallpaperPosition:
      source?.wallpaperPosition === "top" || source?.wallpaperPosition === "bottom"
        ? source.wallpaperPosition
        : "center",
    wallpaperDim: Math.min(0.75, Math.max(0, Number(source?.wallpaperDim) || 0)),
    desktopCss: String(source?.desktopCss || "").slice(0, MAX_CSS_LENGTH),
    chatCss: String(source?.chatCss || "").slice(0, MAX_CSS_LENGTH),
    updatedAt: Number(source?.updatedAt) || 0,
  };
}

export function cssSafetyIssue(css: string): string | null {
  if (css.length > MAX_CSS_LENGTH) return "单个 CSS 不能超过 30,000 个字符。";
  const unsafe = [
    /@import/i,
    /javascript\s*:/i,
    /expression\s*\(/i,
    /behavior\s*:/i,
    /-moz-binding/i,
    /url\s*\(\s*["']?\s*(?:https?:)?\/\//i,
    /<\/?style/i,
    /<\/?script/i,
  ];
  if (unsafe.some((pattern) => pattern.test(css))) {
    return "CSS 中含有外部加载或脚本式内容。为了保护本地资料，请删掉后再保存。";
  }
  const structuralCss = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  let depth = 0;
  for (const character of structuralCss) {
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth < 0) return "CSS 的大括号不完整，无法安全限制在当前页面内。";
  }
  return depth === 0 ? null : "CSS 的大括号没有闭合，请检查后再保存。";
}

export const beautyRepository = {
  storageKey: KEY,
  changeEvent: CHANGE_EVENT,

  read(): BeautySettings {
    const next = normalize(readJson<Partial<BeautySettings>>(KEY, {}));
    return {
      ...next,
      desktopCss: cssSafetyIssue(next.desktopCss) ? "" : next.desktopCss,
      chatCss: cssSafetyIssue(next.chatCss) ? "" : next.chatCss,
    };
  },

  save(settings: BeautySettings) {
    const desktopIssue = cssSafetyIssue(settings.desktopCss);
    const chatIssue = cssSafetyIssue(settings.chatCss);
    if (desktopIssue || chatIssue) throw new Error(desktopIssue || chatIssue || "CSS 无法保存");
    const next = normalize({ ...settings, updatedAt: Date.now() });
    writeJson(KEY, next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return next;
  },

  reset() {
    writeJson(KEY, defaultBeautySettings);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },
};
