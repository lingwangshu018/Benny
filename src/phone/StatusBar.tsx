import { useEffect, useState } from "react";

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

interface StatusBarProps {
  canGoBack: boolean;
  onGoBack: () => void;
}

export function StatusBar({ canGoBack, onGoBack }: StatusBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="status-bar">
      {canGoBack ? (
        <button
          className="status-back-button"
          type="button"
          onClick={onGoBack}
          aria-label="返回上一页"
        >
          <span aria-hidden="true">‹</span>
          返回
        </button>
      ) : (
        <time>{formatTime(now)}</time>
      )}
      <span className="connection-status">异世界连接中 · 87%</span>
    </header>
  );
}
