import { useRef, useState } from "react";
import { libraryRepository } from "../../storage/libraryRepository";

export function LibraryToolbar() {
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");

  function exportData() {
    const blob = new Blob(
      [JSON.stringify(libraryRepository.exportSnapshot(), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `兔兔手机_独立资料库_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const result = libraryRepository.importUnknown(parsed);
      setNotice(
        `已导入：角色 ${result.characters}、世界书 ${result.worldbooks}、预设 ${result.presets}`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导入失败");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="library-toolbar">
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => importData(event.target.files?.[0])}
      />
      <button type="button" onClick={() => input.current?.click()}>
        导入角色卡 / 世界书 / 预设
      </button>
      <button type="button" onClick={exportData}>
        导出资料
      </button>
      {notice && <p>{notice}</p>}
    </div>
  );
}
