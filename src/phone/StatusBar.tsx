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
  unreadCount: number;
  onOpenNotifications: () => void;
  onLock: () => void;
}

export function StatusBar({ canGoBack, onGoBack, unreadCount, onOpenNotifications, onLock }: StatusBarProps) {
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
      <span className="status-actions">
        <button type="button" onClick={onOpenNotifications} aria-label="打开通知中心">◉{unreadCount > 0 && <b>{Math.min(99, unreadCount)}</b>}</button>
        <button type="button" onClick={onLock} aria-label="锁定手机">锁</button>
      </span>
    </header>
  );
}
