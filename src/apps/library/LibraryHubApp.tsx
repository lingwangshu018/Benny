import { useEffect, useState } from "react";
import { LibraryToolbar } from "../../features/library/LibraryToolbar";
import { libraryRepository } from "../../storage/libraryRepository";
import type { AppId } from "../../types/phone";

interface LibraryHubAppProps {
  onOpen: (appId: AppId) => void;
  onShowGuide: () => void;
}

export function LibraryHubApp({ onOpen, onShowGuide }: LibraryHubAppProps) {
  const [snapshot, setSnapshot] = useState(() =>
    libraryRepository.exportSnapshot(),
  );

  useEffect(() => {
    const reload = () => setSnapshot(libraryRepository.exportSnapshot());
    window.addEventListener(libraryRepository.changeEvent, reload);
    return () =>
      window.removeEventListener(libraryRepository.changeEvent, reload);
  }, []);

  const cards: Array<{
    id: AppId;
    icon: string;
    title: string;
    description: string;
    count: number;
  }> = [
    {
      id: "角色档案",
      icon: "♙",
      title: "角色与用户人设",
      description: "联系人、开场白、情景、语气示例与专属绑定",
      count: snapshot.characters.length,
    },
    {
      id: "世界书",
      icon: "▤",
      title: "世界书",
      description: "常驻、关键词、手动触发与角色专属设定",
      count: snapshot.worldbooks.length,
    },
    {
      id: "预设",
      icon: "☷",
      title: "聊天预设",
      description: "提示词、生成参数、历史与记忆读取数量",
      count: snapshot.presets.length,
    },
  ];

  return (
    <section className="library-app library-hub">
      <header className="library-app-heading">
        <div>
          <span>仅保存在这台小手机</span>
          <h1>手机资料库</h1>
        </div>
      </header>
      <p className="library-hub-intro">
        这里与绯界皇家图书馆彼此独立。以后可以通过导入、导出或连接功能交换资料。
      </p>
      <button
        type="button"
        className="library-workbench-button"
        onClick={() => onOpen("连接工作台")}
      >
        <span>◇</span>
        <div>
          <small>资料连接中心</small>
          <strong>角色连接工作台</strong>
          <p>绑定人设、世界书和预设，测试后直接开始聊天</p>
        </div>
        <b>→</b>
      </button>
      <button
        type="button"
        className="library-guide-button"
        onClick={onShowGuide}
      >
        <span>新手路线</span>
        <strong>不知道先做什么？打开首次使用引导</strong>
        <b>→</b>
      </button>
      <LibraryToolbar />
      <div className="library-hub-grid">
        {cards.map((card) => (
          <button type="button" key={card.id} onClick={() => onOpen(card.id)}>
            <span>{card.icon}</span>
            <div>
              <strong>{card.title}</strong>
              <small>{card.description}</small>
            </div>
            <b>{card.count}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
