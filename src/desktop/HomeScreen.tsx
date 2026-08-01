import { useRef, useState } from "react";
import { readJson, writeJson } from "../storage/localStorage";
import type { AppId, PhoneApp } from "../types/phone";
import { TimeWidget } from "../widgets/TimeWidget";

const firstPageApps: PhoneApp[] = [
  { id: "微信", legacyPage: "chat", icon: "✦", accent: "#6ebd79" },
  { id: "预设", legacyPage: "presets", icon: "☷", accent: "#aa83be" },
  { id: "世界书", legacyPage: "worldbook", icon: "📖", accent: "#8d6f5c" },
  { id: "设置", legacyPage: "settings", icon: "⚙", accent: "#778594" },
  { id: "美化", legacyPage: "beautify", icon: "✎", accent: "#d889a7" },
  { id: "角色档案", legacyPage: "characters", icon: "♙", accent: "#9877b7" },
  { id: "记忆宫殿", legacyPage: "memorypalace", icon: "♜", accent: "#7087b9" },
  { id: "资料库", legacyPage: "library", icon: "▤", accent: "#956d58" },
  { id: "数据保险箱", legacyPage: "vault", icon: "◆", accent: "#4f7b78" },
  { id: "朋友圈", legacyPage: "moments", icon: "◎", accent: "#6f9b85" },
  { id: "短信", legacyPage: "sms", icon: "●", accent: "#79a9c7" },
  { id: "日记", legacyPage: "diary", icon: "✎", accent: "#a48773" },
  { id: "相册", legacyPage: "album", icon: "▧", accent: "#7594a3" },
  { id: "情侣空间", legacyPage: "couple", icon: "♡", accent: "#b77d91" },
];

const secondPageApps: PhoneApp[] = [
  { id: "番茄钟", legacyPage: "pomowork", icon: "◷", accent: "#d78374" },
  { id: "春日农场", legacyPage: "farm", icon: "🌱", accent: "#7da467" },
  { id: "游戏", legacyPage: "gamehub", icon: "✣", accent: "#817cbe" },
  { id: "小剧场", legacyPage: "theater", icon: "🎭", accent: "#b56e78" },
  { id: "小组件", legacyPage: "widgets", icon: "▦", accent: "#6e9c9c" },
];

function restoreSlots(
  apps: PhoneApp[],
  layoutKey: string,
  legacyOrderKey: string,
  slotCount: number,
): Array<AppId | null> {
  const knownIds = new Set(apps.map((app) => app.id));
  const saved = readJson<Array<AppId | null>>(layoutKey, []);
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const value = saved[index];
    return value && knownIds.has(value) ? value : null;
  });

  if (saved.length === 0) {
    const legacyOrder = readJson<string[]>(legacyOrderKey, [])
      .map((value) => value.replace(/^app-/, ""))
      .filter((value): value is AppId => knownIds.has(value as AppId));
    const ordered = [
      ...legacyOrder,
      ...apps.map((app) => app.id).filter((id) => !legacyOrder.includes(id)),
    ];
    ordered.forEach((appId, index) => {
      if (index < slots.length) slots[index] = appId;
    });
    return slots;
  }

  const placed = new Set(slots.filter((value): value is AppId => value !== null));
  for (const app of apps) {
    if (placed.has(app.id)) continue;
    const emptyIndex = slots.indexOf(null);
    if (emptyIndex >= 0) slots[emptyIndex] = app.id;
  }
  return slots;
}

interface AppGridProps {
  apps: PhoneApp[];
  editing: boolean;
  layoutKey: string;
  legacyOrderKey: string;
  slotCount?: number;
  onOpenApp: (appId: AppId) => void;
}

interface DesktopDragState {
  appId: AppId;
  sourceSlot: number;
  targetSlot: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

function AppGrid({
  apps: initialApps,
  editing,
  layoutKey,
  legacyOrderKey,
  slotCount = 16,
  onOpenApp,
}: AppGridProps) {
  const appsById = new Map(initialApps.map((app) => [app.id, app]));
  const [slots, setSlots] = useState(() =>
    restoreSlots(initialApps, layoutKey, legacyOrderKey, slotCount),
  );
  const [drag, setDrag] = useState<DesktopDragState | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const dragRef = useRef<DesktopDragState | null>(null);
  const suppressClickRef = useRef(false);

  function updateDragState(next: DesktopDragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function startDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    appId: AppId,
    sourceSlot: number,
  ) {
    if (!editing) return;
    event.stopPropagation();
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDragState({
      appId,
      sourceSlot,
      targetSlot: sourceSlot,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: 0,
      offsetY: 0,
    });
  }

  function updateDrag(event: React.PointerEvent<HTMLElement>) {
    const currentDrag = dragRef.current;
    if (!currentDrag) return;
    event.preventDefault();
    const target = Array.from(
      event.currentTarget
        .closest(".app-grid")
        ?.querySelectorAll<HTMLElement>("[data-app-slot]") ?? [],
    ).find((slot) => {
      const rect = slot.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    });
    const targetSlot = Number(target?.dataset.appSlot);
    updateDragState({
      ...currentDrag,
      targetSlot: Number.isInteger(targetSlot)
        ? targetSlot
        : currentDrag.targetSlot,
      offsetX: event.clientX - currentDrag.startX,
      offsetY: event.clientY - currentDrag.startY,
    });
  }

  function finishDrag(event: React.PointerEvent<HTMLElement>) {
    const currentDrag = dragRef.current;
    if (!currentDrag) return;
    event.stopPropagation();
    const moved =
      Math.abs(currentDrag.offsetX) > 6 || Math.abs(currentDrag.offsetY) > 6;
    if (!moved) {
      suppressClickRef.current = true;
      updateDragState(null);
      selectOrMove(currentDrag.sourceSlot);
      return;
    }
    event.preventDefault();
    const next = [...slots];
    const displaced = next[currentDrag.targetSlot];
    next[currentDrag.targetSlot] = currentDrag.appId;
    next[currentDrag.sourceSlot] = displaced;
    suppressClickRef.current = true;
    setSlots(next);
    writeJson(layoutKey, next);
    setSelectedSlot(null);
    updateDragState(null);
  }

  function selectOrMove(targetSlot: number) {
    if (selectedSlot === null) {
      if (slots[targetSlot]) setSelectedSlot(targetSlot);
      return;
    }
    if (selectedSlot === targetSlot) {
      setSelectedSlot(null);
      return;
    }
    const next = [...slots];
    const displaced = next[targetSlot];
    next[targetSlot] = next[selectedSlot];
    next[selectedSlot] = displaced;
    setSlots(next);
    writeJson(layoutKey, next);
    setSelectedSlot(null);
  }

  return (
    <div
      className="app-grid"
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={() => updateDragState(null)}
    >
      {slots.map((appId, slotIndex) => {
        const app = appId ? appsById.get(appId) : undefined;
        const isTarget = drag?.targetSlot === slotIndex;
        const isSelected = selectedSlot === slotIndex;
        return (
          <div
            className={`app-slot ${isTarget ? "drag-target" : ""} ${
              isSelected ? "is-selected" : ""
            }`}
            data-app-slot={slotIndex}
            key={slotIndex}
          >
            {app && (
              <button
                className={`app-tile ${drag?.appId === app.id ? "dragging" : ""}`}
                type="button"
                data-legacy-page={app.legacyPage}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  if (editing) selectOrMove(slotIndex);
                  else onOpenApp(app.id);
                }}
                onPointerDown={(event) => startDrag(event, app.id, slotIndex)}
                style={
                  drag?.appId === app.id
                    ? {
                        transform: `translate3d(${drag.offsetX}px, ${drag.offsetY}px, 0) scale(1.08)`,
                      }
                    : undefined
                }
              >
                <span
                  className="app-icon"
                  style={{ "--app-accent": app.accent } as React.CSSProperties}
                  aria-hidden="true"
                >
                  {app.icon}
                </span>
                <span>{app.id}</span>
              </button>
            )}
            {!app && editing && (
              <button
                className="empty-slot-target"
                type="button"
                aria-label={`空位 ${slotIndex + 1}`}
                onClick={() => selectOrMove(slotIndex)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface HomeScreenProps {
  onOpenApp: (appId: AppId) => void;
}

export function HomeScreen({ onOpenApp }: HomeScreenProps) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const pointerStart = useRef<{
    x: number;
    y: number;
    startedAt: number;
  } | null>(null);
  const suppressClick = useRef(false);

  function suppressSwipeClick() {
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }

  function startLongPress(x: number, y: number) {
    pointerStart.current = { x, y, startedAt: Date.now() };
    longPressTimer.current = window.setTimeout(() => setEditing(true), 650);
  }

  function cancelLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <section
      className={`home-screen ${editing ? "is-editing" : ""} ${
        swiping ? "is-swiping" : ""
      }`}
      onPointerDown={(event) => {
        if (!editing) startLongPress(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!pointerStart.current) return;
        const distance = Math.hypot(
          event.clientX - pointerStart.current.x,
          event.clientY - pointerStart.current.y,
        );
        if (distance > 12) cancelLongPress();
        if (editing) return;
        const horizontal = event.clientX - pointerStart.current.x;
        const vertical = event.clientY - pointerStart.current.y;
        if (Math.abs(horizontal) < 7 || Math.abs(horizontal) <= Math.abs(vertical)) {
          return;
        }
        event.preventDefault();
        setSwiping(true);
        const atStartEdge = page === 0 && horizontal > 0;
        const atEndEdge = page === 1 && horizontal < 0;
        setSwipeOffset(
          atStartEdge || atEndEdge ? horizontal * 0.28 : horizontal,
        );
      }}
      onPointerUp={(event) => {
        cancelLongPress();
        if (!pointerStart.current || editing) {
          pointerStart.current = null;
          return;
        }
        const horizontal = event.clientX - pointerStart.current.x;
        const vertical = event.clientY - pointerStart.current.y;
        const elapsed = Math.max(1, Date.now() - pointerStart.current.startedAt);
        const velocity = Math.abs(horizontal) / elapsed;
        if (
          Math.abs(horizontal) > 44 &&
          Math.abs(horizontal) > Math.abs(vertical) &&
          (Math.abs(horizontal) > 76 || velocity > 0.35)
        ) {
          suppressSwipeClick();
          setPage((current) =>
            horizontal < 0 ? Math.min(1, current + 1) : Math.max(0, current - 1),
          );
        } else if (Math.abs(horizontal) > 8) {
          suppressSwipeClick();
        }
        setSwipeOffset(0);
        setSwiping(false);
        pointerStart.current = null;
      }}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onPointerCancel={() => {
        cancelLongPress();
        pointerStart.current = null;
        setSwipeOffset(0);
        setSwiping(false);
      }}
    >
      {!editing && (
        <button
          className="desktop-edit-trigger"
          type="button"
          onClick={() => setEditing(true)}
        >
          整理
        </button>
      )}

      {editing && (
        <div className="edit-banner">
          <span>拖动，或先点图标再点空位</span>
          <button type="button" onClick={() => setEditing(false)}>
            完成
          </button>
        </div>
      )}

      <div
        className="desktop-pages"
        style={{
          transform: `translate3d(calc(${-page * 100}% + ${swipeOffset}px), 0, 0)`,
        }}
      >
        <section className="desktop-page" aria-hidden={page !== 0}>
          <TimeWidget />
          <AppGrid
            apps={firstPageApps}
            editing={editing}
            layoutKey="aether.desktopSlots.homePage1"
            legacyOrderKey="desktopOrder_homePage1"
            onOpenApp={onOpenApp}
          />
        </section>
        <section className="desktop-page" aria-hidden={page !== 1}>
          <div className="second-page-heading">
            <span>异世界工具箱</span>
            <strong>兔兔的生活应用</strong>
          </div>
          <AppGrid
            apps={secondPageApps}
            editing={editing}
            layoutKey="aether.desktopSlots.homePage2"
            legacyOrderKey="desktopOrder_homePage2"
            onOpenApp={onOpenApp}
          />
        </section>
      </div>

      <nav className="page-dots" aria-label="桌面分页">
        {[0, 1].map((index) => (
          <button
            key={index}
            type="button"
            className={page === index ? "active" : ""}
            aria-label={`第 ${index + 1} 页`}
            onClick={() => setPage(index)}
          />
        ))}
      </nav>
    </section>
  );
}
