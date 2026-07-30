import { useState } from "react";
import { ConnectionCenterApp } from "./apps/connection/ConnectionCenterApp";
import { CharacterArchiveApp } from "./apps/library/CharacterArchiveApp";
import { LibraryHubApp } from "./apps/library/LibraryHubApp";
import { PresetApp } from "./apps/library/PresetApp";
import { WorldbookApp } from "./apps/library/WorldbookApp";
import { MemoryPalaceApp } from "./apps/memory/MemoryPalaceApp";
import { PomodoroApp } from "./apps/pomodoro/PomodoroApp";
import { AISettingsApp } from "./apps/settings/AISettingsApp";
import { HomeScreen } from "./desktop/HomeScreen";
import {
  FirstUseGuide,
  ONBOARDING_KEY,
} from "./features/onboarding/FirstUseGuide";
import { PhoneShell } from "./phone/PhoneShell";
import { libraryRepository } from "./storage/libraryRepository";
import type { AppId } from "./types/phone";

export function App() {
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [appHistory, setAppHistory] = useState<AppId[]>([]);
  const [showGuide, setShowGuide] = useState(() => {
    const snapshot = libraryRepository.exportSnapshot();
    const isEmpty =
      snapshot.characters.length === 0 &&
      snapshot.worldbooks.length === 0 &&
      snapshot.presets.length === 0;
    return isEmpty && window.localStorage.getItem(ONBOARDING_KEY) === null;
  });

  function openApp(nextApp: AppId) {
    setAppHistory((history) =>
      activeApp ? [...history, activeApp] : history,
    );
    setActiveApp(nextApp);
  }

  function goBack() {
    setAppHistory((history) => {
      const previousApp = history.at(-1) ?? null;
      setActiveApp(previousApp);
      return history.slice(0, -1);
    });
  }

  function goHome() {
    setAppHistory([]);
    setActiveApp(null);
  }

  function renderActiveApp() {
    if (activeApp === "微信")
      return (
        <ConnectionCenterApp onOpenSettings={() => openApp("设置")} />
      );
    if (activeApp === "设置") return <AISettingsApp />;
    if (activeApp === "番茄钟") {
      return <PomodoroApp />;
    }
    if (activeApp === "角色档案") return <CharacterArchiveApp />;
    if (activeApp === "世界书") return <WorldbookApp />;
    if (activeApp === "预设") return <PresetApp />;
    if (activeApp === "记忆宫殿") return <MemoryPalaceApp />;
    if (activeApp === "资料库")
      return (
        <LibraryHubApp
          onOpen={openApp}
          onShowGuide={() => setShowGuide(true)}
        />
      );

    return (
      <section className="placeholder-app">
        <p className="eyebrow">房间已经预留</p>
        <h1>{activeApp}</h1>
        <p>下一阶段会从 Bunny 原版逐项迁入这里。</p>
        <button type="button" onClick={goBack}>
          返回桌面
        </button>
      </section>
    );
  }

  return (
    <main className="stage">
      <PhoneShell
        canGoBack={activeApp !== null}
        onGoBack={goBack}
        onGoHome={goHome}
      >
        {activeApp ? renderActiveApp() : <HomeScreen onOpenApp={openApp} />}
      </PhoneShell>
      {showGuide && (
        <FirstUseGuide
          onClose={() => setShowGuide(false)}
          onOpen={openApp}
        />
      )}
    </main>
  );
}
