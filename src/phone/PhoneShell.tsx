import { useEffect, useState, type PropsWithChildren } from "react";
import { notificationRepository } from "../storage/notificationRepository";
import type { PhoneNotification } from "../types/notification";
import type { AppId } from "../types/phone";
import { LockScreen } from "./LockScreen";
import { NotificationDrawer } from "./NotificationDrawer";
import { StatusBar } from "./StatusBar";

interface PhoneShellProps extends PropsWithChildren {
  canGoBack: boolean;
  onGoBack: () => void;
  onGoHome: () => void;
  onOpenApp: (appId: AppId) => void;
}

export function PhoneShell({
  children,
  canGoBack,
  onGoBack,
  onGoHome,
  onOpenApp,
}: PhoneShellProps) {
  const [locked, setLocked] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => notificationRepository.all());
  const [banner, setBanner] = useState<PhoneNotification | null>(null);

  useEffect(() => {
    const reload = () => setNotifications(notificationRepository.all());
    const pushed = (event: Event) => {
      const item = (event as CustomEvent<PhoneNotification>).detail;
      reload();
      setBanner(item);
      window.setTimeout(() => setBanner((current) => current?.id === item.id ? null : current), 4500);
    };
    window.addEventListener(notificationRepository.changeEvent, reload);
    window.addEventListener(notificationRepository.pushEvent, pushed);
    return () => {
      window.removeEventListener(notificationRepository.changeEvent, reload);
      window.removeEventListener(notificationRepository.pushEvent, pushed);
    };
  }, []);

  function openNotification(appId: AppId, notificationId: string) {
    notificationRepository.markRead(notificationId);
    setLocked(false);
    setDrawerOpen(false);
    setBanner(null);
    onOpenApp(appId);
  }

  return (
    <section className="phone-shell" aria-label="异世界连接终端">
      <StatusBar
        canGoBack={canGoBack}
        onGoBack={onGoBack}
        unreadCount={notifications.filter((item) => !item.read).length}
        onOpenNotifications={() => setDrawerOpen(true)}
        onLock={() => setLocked(true)}
      />
      <div className="phone-screen">{children}</div>
      <button
        className="home-indicator"
        type="button"
        aria-label="返回桌面"
        onClick={onGoHome}
      />
      {banner && !locked && (
        <button className="notification-banner" type="button" onClick={() => openNotification(banner.appId, banner.id)}>
          <span>{banner.title}</span><strong>{banner.body}</strong>
        </button>
      )}
      {drawerOpen && !locked && (
        <NotificationDrawer
          items={notifications}
          onClose={() => setDrawerOpen(false)}
          onOpen={openNotification}
          onClear={() => notificationRepository.clear()}
        />
      )}
      {locked && (
        <LockScreen
          notifications={notifications.filter((item) => !item.read)}
          onUnlock={() => setLocked(false)}
          onOpen={openNotification}
        />
      )}
    </section>
  );
}
