import { useEffect, useState } from "react";
import { beautyRepository } from "../../storage/beautyRepository";
import { largeStorageRepository } from "../../storage/largeStorageRepository";

function cssText(desktopCss: string, chatCss: string) {
  return `
    @scope (.home-screen) { ${desktopCss} }
    @scope (.chat-app) { ${chatCss} }
  `;
}

export function BeautyRuntime() {
  const [settings, setSettings] = useState(() => beautyRepository.read());
  const [wallpaperUrl, setWallpaperUrl] = useState("");
  const safeMode = new URLSearchParams(window.location.search).has("safe-style");

  useEffect(() => {
    const reload = () => setSettings(beautyRepository.read());
    window.addEventListener(beautyRepository.changeEvent, reload);
    return () => window.removeEventListener(beautyRepository.changeEvent, reload);
  }, []);

  useEffect(() => {
    let objectUrl = "";
    if (!settings.wallpaperReference) {
      setWallpaperUrl("");
      return;
    }
    void largeStorageRepository.readWallpaper().then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setWallpaperUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [settings.wallpaperReference, settings.updatedAt]);

  const wallpaper = wallpaperUrl
    ? `.home-screen { background-image: linear-gradient(rgba(255,255,255,${settings.wallpaperDim}), rgba(255,255,255,${settings.wallpaperDim})), url("${wallpaperUrl}") !important; background-size: cover !important; background-position: ${settings.wallpaperPosition} !important; }`
    : "";

  return (
    <style data-bunny-beauty>
      {safeMode ? "" : `${wallpaper}\n${cssText(settings.desktopCss, settings.chatCss)}`}
    </style>
  );
}
