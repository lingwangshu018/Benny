import type { PhoneNotification } from "../types/notification";
import type { AppId } from "../types/phone";

interface NotificationDrawerProps {
  items: PhoneNotification[];
  onClose: () => void;
  onOpen: (appId: AppId, id: string) => void;
  onClear: () => void;
}

export function NotificationDrawer({ items, onClose, onOpen, onClear }: NotificationDrawerProps) {
  return (
    <section className="notification-drawer">
      <header><div><span>通知中心</span><strong>{items.filter((item) => !item.read).length} 条未读</strong></div><button type="button" onClick={onClose}>完成</button></header>
      <div>
        {items.map((item) => (
          <button className={item.read ? "read" : ""} type="button" key={item.id} onClick={() => onOpen(item.appId, item.id)}>
            <span className="notice-avatar">{item.avatar ? <img src={item.avatar} alt="" /> : item.title.slice(0, 1)}</span>
            <span><strong>{item.title}</strong><small>{item.body}</small></span>
          </button>
        ))}
        {items.length === 0 && <p>暂无通知</p>}
      </div>
      {items.length > 0 && <button className="clear-notifications" type="button" onClick={onClear}>清空通知</button>}
    </section>
  );
}
