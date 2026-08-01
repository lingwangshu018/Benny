import { useEffect, useRef, useState } from "react";
import { beautyRepository, cssSafetyIssue } from "../../storage/beautyRepository";
import { largeStorageRepository } from "../../storage/largeStorageRepository";
import type { BeautySettings } from "../../types/beauty";

const MAX_WALLPAPER_BYTES = 15 * 1024 * 1024;

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
        <header><strong>桌面 CSS</strong><span>只作用于桌面内部</span></header>
        <textarea rows={8} spellCheck={false} value={draft.desktopCss} placeholder={`.app-icon { border-radius: 18px; }\n.time-widget { backdrop-filter: blur(18px); }`} onChange={(event) => setDraft({ ...draft, desktopCss: event.target.value })} />
      </section>
      <section className="beauty-code-card">
        <header><strong>聊天框 CSS</strong><span>只作用于微信聊天内部</span></header>
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
