import { useEffect, useMemo, useState } from "react";
import { readJson, readText, writeJson, writeText } from "../../storage/localStorage";

type Mode = "focus" | "break";

interface DailyRecord {
  count: number;
  minutes: number;
}

type PomodoroRecords = Record<string, DailyRecord>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function PomodoroApp() {
  const [focusMinutes, setFocusMinutes] = useState(() =>
    Number(readText("pomoFocusMinutes", "25")),
  );
  const [breakMinutes, setBreakMinutes] = useState(() =>
    Number(readText("pomoBreakMinutes", "5")),
  );
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("准备专注");
  const [records, setRecords] = useState<PomodoroRecords>(() =>
    readJson("pomoRecords", {}),
  );

  const total = (mode === "focus" ? focusMinutes : breakMinutes) * 60;
  const progress = total === 0 ? 0 : remaining / total;
  const today = records[todayKey()] ?? { count: 0, minutes: 0 };
  const display = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(
    remaining % 60,
  ).padStart(2, "0")}`;
  const ringStyle = useMemo(
    () => ({
      background: `conic-gradient(${mode === "focus" ? "#ef7474" : "#57b6ad"} ${
        progress * 360
      }deg, #e9e2eb 0deg)`,
    }),
    [mode, progress],
  );

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current > 1) return current - 1;
        setRunning(false);
        if (mode === "focus") {
          const key = todayKey();
          setRecords((currentRecords) => {
            const updated: PomodoroRecords = {
              ...currentRecords,
              [key]: {
                count: (currentRecords[key]?.count ?? 0) + 1,
                minutes: (currentRecords[key]?.minutes ?? 0) + focusMinutes,
              },
            };
            const recent = Object.fromEntries(
              Object.entries(updated).sort().slice(-30),
            ) as PomodoroRecords;
            writeJson("pomoRecords", recent);
            return recent;
          });
          setMode("break");
          setMessage("🎉 专注完成，休息一下");
          return breakMinutes * 60;
        }
        setMode("focus");
        setMessage("☕ 休息结束，继续加油");
        return focusMinutes * 60;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [breakMinutes, focusMinutes, mode, running]);

  function switchMode(nextMode: Mode) {
    setRunning(false);
    setMode(nextMode);
    setRemaining((nextMode === "focus" ? focusMinutes : breakMinutes) * 60);
    setMessage(nextMode === "focus" ? "准备专注" : "休息一下");
  }

  function applySettings() {
    const nextFocus = clamp(Math.round(focusMinutes || 25), 1, 120);
    const nextBreak = clamp(Math.round(breakMinutes || 5), 1, 60);
    setFocusMinutes(nextFocus);
    setBreakMinutes(nextBreak);
    writeText("pomoFocusMinutes", String(nextFocus));
    writeText("pomoBreakMinutes", String(nextBreak));
    setRunning(false);
    setRemaining((mode === "focus" ? nextFocus : nextBreak) * 60);
    setMessage("设置已保存");
  }

  return (
    <section className={`pomodoro-app mode-${mode}`}>
      <div className="pomo-tabs">
        <button
          className={mode === "focus" ? "active" : ""}
          type="button"
          onClick={() => switchMode("focus")}
        >
          专注
        </button>
        <button
          className={mode === "break" ? "active" : ""}
          type="button"
          onClick={() => switchMode("break")}
        >
          休息
        </button>
      </div>

      <div className="pomo-ring" style={ringStyle}>
        <div>
          <time>{display}</time>
          <span>{message}</span>
        </div>
      </div>

      <div className="pomo-actions">
        <button type="button" onClick={() => setRunning((value) => !value)}>
          {running ? "暂停" : "开始"}
        </button>
        <button type="button" onClick={() => switchMode(mode)}>
          重置
        </button>
      </div>

      <div className="pomo-summary">
        <div>
          <strong>{today.count}</strong>
          <span>今日番茄</span>
        </div>
        <div>
          <strong>{today.minutes}</strong>
          <span>专注分钟</span>
        </div>
        <div>
          <strong>{(today.minutes / 60).toFixed(1)}</strong>
          <span>累计小时</span>
        </div>
      </div>

      <div className="pomo-settings">
        <label>
          专注分钟
          <input
            type="number"
            min="1"
            max="120"
            value={focusMinutes}
            onChange={(event) => setFocusMinutes(Number(event.target.value))}
          />
        </label>
        <label>
          休息分钟
          <input
            type="number"
            min="1"
            max="60"
            value={breakMinutes}
            onChange={(event) => setBreakMinutes(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={applySettings}>
          应用设置
        </button>
      </div>
    </section>
  );
}
