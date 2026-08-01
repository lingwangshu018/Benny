import { useEffect, useState } from "react";
import type { PhoneNotification } from "../types/notification";
import type { AppId } from "../types/phone";

interface LockScreenProps {
  notifications: PhoneNotification[];
  onUnlock: () => void;
  onOpen: (appId: AppId, notificationId: string) => void;
}

export function LockScreen({ notifications, onUnlock, onOpen }: LockScreenProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <section className="lock-screen">
      <div className="lock-clock">
        <time>{now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
        <span>{now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</span>
      </div>
      <div className="lock-notifications">
        {notifications.slice(0, 4).map((item) => (
          <button type="button" key={item.id} onClick={() => onOpen(item.appId, item.id)}>
            <span className="notice-avatar">{item.avatar ? <img src={item.avatar} alt="" /> : item.title.slice(0, 1)}</span>
            <span><strong>{item.title}</strong><small>{item.body}</small></span>
            <time>{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </button>
        ))}
        {notifications.length === 0 && <p>异世界连接安静地等待着</p>}
      </div>
      <button className="unlock-button" type="button" onClick={onUnlock}>向上解锁</button>
    </section>
  );
}
