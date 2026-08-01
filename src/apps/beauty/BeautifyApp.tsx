import { useEffect, useRef, useState } from "react";
import { beautyRepository, cssSafetyIssue } from "../../storage/beautyRepository";
import { largeStorageRepository } from "../../storage/largeStorageRepository";
import type { BeautySettings } from "../../types/beauty";

const MAX_WALLPAPER_BYTES = 15 * 1024 * 1024;

const INITIAL_DESKTOP_CSS = `/* Bunny 桌面初始样式：复制后按喜欢的方式修改 */
.time-widget {
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.58);
  backdrop-filter: blur(14px);
}

.app-icon {
  border-radius: 22px;
  box-shadow: 0 8px 18px rgba(66, 52, 72, 0.16);
}

.app-tile > span:last-child {
  color: #4f4354;
  font-size: 9px;
}

.page-dots button {
  background: rgba(255, 255, 255, 0.55);
}

.page-dots button.active {
  background: #ffffff;
}`;

const INITIAL_CHAT_CSS = `/* Bunny 聊天框初始样式：复制后按喜欢的方式修改 */
.chat-message {
  border-radius: 16px 16px 16px 5px;
  color: #3e3542;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 7px 18px rgba(91, 76, 97, 0.07);
}

.chat-message.user {
  border-radius: 16px 16px 5px 16px;
  color: #ffffff;
  background: linear-gradient(145deg, #86718c, #65546c);
}

.chat-composer {
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.81);
}

.chat-composer > button:last-child {
  color: #ffffff;
  background: #65556d;
}`;

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // file:// 等环境可能暴露 Clipboard API 却拒绝写入，继续使用本地回退。
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器没有允许复制，请手动复制编辑框中的内容。");
}

export function BeautifyApp() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<BeautySettings>(() => beautyRepository.read());
  const [pendingWallpaper, setPendingWallpaper] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("所有美化只保存在这台设备。自定义 CSS 会被限制在对应页面内。");

  useEffect(() => {
    if (!pendingWallpaper) return;
    const url = URL.createObjectURL(pendingWallpaper);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingWallpaper]);

  function chooseWallpaper(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus("请选择图片文件。");
    if (file.size > MAX_WALLPAPER_BYTES) return setStatus("壁纸不能超过 15 MB。");
    setPendingWallpaper(file);
    setStatus("新壁纸已进入预览，点击保存后才会替换桌面。");
  }

  async function save() {
    const issue = cssSafetyIssue(draft.desktopCss) || cssSafetyIssue(draft.chatCss);
    if (issue) return setStatus(issue);
    try {
      let wallpaperReference = draft.wallpaperReference;
      if (pendingWallpaper) {
        wallpaperReference = await largeStorageRepository.saveWallpaper(pendingWallpaper);
      }
      const saved = beautyRepository.save({ ...draft, wallpaperReference });
      setDraft(saved);
      setPendingWallpaper(null);
      setPreview("");
      setStatus("美化已保存。回到桌面或聊天即可看到效果。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "美化保存失败。");
    }
  }

  async function reset() {
    if (!window.confirm("恢复默认桌面和聊天样式吗？")) return;
    await largeStorageRepository.removeWallpaper();
    beautyRepository.reset();
    setDraft(beautyRepository.read());
    setPendingWallpaper(null);
    setPreview("");
    setStatus("已恢复 Bunny 默认样式。");
  }

  async function copyInitialCss(kind: "desktop" | "chat") {
    try {
      await copyText(kind === "desktop" ? INITIAL_DESKTOP_CSS : INITIAL_CHAT_CSS);
      setStatus(`${kind === "desktop" ? "桌面" : "聊天框"}初始代码已复制，可以粘贴到下面修改。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "复制失败。");
    }
  }

  return (
    <section className="beautify-app">
      <header className="beautify-heading">
        <span>BEAUTY LAB · v0.22</span>
        <h1>美化工作台</h1>
        <p>换一张桌面，也可以用 CSS 打造自己的图标、组件与聊天气泡。</p>
      </header>

      <article className="beauty-wallpaper-card">
        <div className="beauty-wallpaper-preview" style={preview ? { backgroundImage: `url("${preview}")` } : undefined}>
          <span>{preview || draft.wallpaperReference ? "壁纸预览" : "Bunny 默认桌面"}</span>
        </div>
        <input ref={fileRef} className="sr-only" type="file" accept="image/*" onChange={(event) => chooseWallpaper(event.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()}>选择桌面壁纸</button>
        <label>
          壁纸位置
          <select value={draft.wallpaperPosition} onChange={(event) => setDraft({ ...draft, wallpaperPosition: event.target.value as BeautySettings["wallpaperPosition"] })}>
            <option value="center">居中</option><option value="top">顶部</option><option value="bottom">底部</option>
          </select>
        </label>
        <label>
          柔光遮罩 {Math.round(draft.wallpaperDim * 100)}%
          <input type="range" min="0" max="0.75" step="0.05" value={draft.wallpaperDim} onChange={(event) => setDraft({ ...draft, wallpaperDim: Number(event.target.value) })} />
        </label>
      </article>

      <section className="beauty-code-card">
        <header>
          <span><strong>桌面 CSS</strong><small>只作用于桌面内部</small></span>
          <button type="button" onClick={() => void copyInitialCss("desktop")}>复制初始代码</button>
        </header>
        <textarea rows={8} spellCheck={false} value={draft.desktopCss} placeholder={`.app-icon { border-radius: 18px; }\n.time-widget { backdrop-filter: blur(18px); }`} onChange={(event) => setDraft({ ...draft, desktopCss: event.target.value })} />
      </section>
      <section className="beauty-code-card">
        <header>
          <span><strong>聊天框 CSS</strong><small>只作用于微信聊天内部</small></span>
          <button type="button" onClick={() => void copyInitialCss("chat")}>复制初始代码</button>
        </header>
        <textarea rows={8} spellCheck={false} value={draft.chatCss} placeholder={`.chat-message { border-radius: 22px; }\n.chat-message.user { background: #d889a7; }`} onChange={(event) => setDraft({ ...draft, chatCss: event.target.value })} />
      </section>
      <p className="beauty-safety-note">不会执行脚本，也不允许 CSS 从外部网址加载资源。如果样式写错，在网址后加 <code>?safe-style=1</code> 可临时关闭自定义美化。</p>
      <div className="beauty-actions">
        <button type="button" onClick={() => void reset()}>恢复默认</button>
        <button className="primary" type="button" onClick={() => void save()}>保存并应用</button>
      </div>
      <p className="beauty-status" role="status">{status}</p>
    </section>
  );
}
