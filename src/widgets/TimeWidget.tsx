import { useEffect, useMemo, useRef, useState } from "react";
import { readText, writeText } from "../storage/localStorage";

const timezones = [
  { id: "local", label: "本地时间" },
  { id: "Asia/Shanghai", label: "上海 / 北京" },
  { id: "Asia/Tokyo", label: "东京" },
  { id: "Asia/Seoul", label: "首尔" },
  { id: "Europe/London", label: "伦敦" },
  { id: "Europe/Paris", label: "巴黎" },
  { id: "America/New_York", label: "纽约" },
  { id: "America/Los_Angeles", label: "洛杉矶" },
  { id: "Australia/Sydney", label: "悉尼" },
];

function formatInTimezone(date: Date, timezone: string) {
  const options: Intl.DateTimeFormatOptions =
    timezone === "local" ? {} : { timeZone: timezone };
  const time = new Intl.DateTimeFormat("zh-CN", {
    ...options,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const day = new Intl.DateTimeFormat("zh-CN", {
    ...options,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
  return { time, day };
}

export function TimeWidget() {
  const [now, setNow] = useState(() => new Date());
  const [timezone, setTimezone] = useState(() =>
    readText("selectedTimezone", "local"),
  );
  const [image, setImage] = useState(() =>
    readText(
      "bunnyHeroImage",
      "https://i.postimg.cc/63KLvWp3/bei-lan-hu-die-bao-wei-de-xia-tian-1-ins-bi-zhi-ji-lai-zi-xiao-hong-shu-wang-ye-ban.jpg",
    ),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const display = useMemo(
    () => formatInTimezone(now, timezone),
    [now, timezone],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  function selectTimezone(nextTimezone: string) {
    setTimezone(nextTimezone);
    writeText("selectedTimezone", nextTimezone);
  }

  function changeImage(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      setImage(reader.result);
      writeText("bunnyHeroImage", reader.result);
    });
    reader.readAsDataURL(file);
  }

  return (
    <article className="time-widget">
      <button
        className="time-widget-image"
        type="button"
        onClick={() => fileInput.current?.click()}
        aria-label="更换时间组件图片"
      >
        <img src={image} alt="" />
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => changeImage(event.target.files?.[0])}
      />
      <div className="time-widget-details">
        <time>{display.time}</time>
        <span>{display.day}</span>
        <label>
          <span className="sr-only">时区</span>
          <select
            value={timezone}
            onChange={(event) => selectTimezone(event.target.value)}
          >
            {timezones.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}
