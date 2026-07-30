import type { PropsWithChildren } from "react";
import { StatusBar } from "./StatusBar";

interface PhoneShellProps extends PropsWithChildren {
  canGoBack: boolean;
  onGoBack: () => void;
  onGoHome: () => void;
}

export function PhoneShell({
  children,
  canGoBack,
  onGoBack,
  onGoHome,
}: PhoneShellProps) {
  return (
    <section className="phone-shell" aria-label="异世界连接终端">
      <StatusBar canGoBack={canGoBack} onGoBack={onGoBack} />
      <div className="phone-screen">{children}</div>
      <button
        className="home-indicator"
        type="button"
        aria-label="返回桌面"
        onClick={onGoHome}
      />
    </section>
  );
}
