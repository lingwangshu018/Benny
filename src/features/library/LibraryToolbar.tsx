import { useRef, useState } from "react";
import { libraryRepository } from "../../storage/libraryRepository";
import {
  libraryMigration,
  type MigrationPreview,
} from "./migration/libraryMigration";

export function LibraryToolbar() {
  const input = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<MigrationPreview | null>(null);

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
      setPreview(
        libraryMigration.preview(parsed, libraryRepository.exportSnapshot()),
      );
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导入失败");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  function confirmImport() {
    if (!preview) return;
    const result = libraryMigration.commit(preview);
    setNotice(
      `搬家完成：角色 ${result.characters}、世界书 ${result.worldbooks}、预设 ${result.presets}${
        result.duplicates ? `；跳过重复 ${result.duplicates}` : ""
      }`,
    );
    setPreview(null);
  }

  const groups = preview
    ? [
        { label: "角色", items: preview.characters, name: "name" },
        { label: "世界书", items: preview.worldbooks, name: "title" },
        { label: "预设", items: preview.presets, name: "title" },
      ]
    : [];
  const readyCount = groups.reduce(
    (count, group) =>
      count + group.items.filter((item) => item.status === "ready").length,
    0,
  );

  return (
    <>
      <div className="library-toolbar">
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => importData(event.target.files?.[0])}
        />
        <button type="button" onClick={() => input.current?.click()}>
          从旧手机搬家
        </button>
        <button type="button" onClick={exportData}>
          导出资料
        </button>
        {notice && <p>{notice}</p>}
      </div>
      {preview && (
        <div className="migration-backdrop" role="presentation">
          <section
            className="migration-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="migration-title"
          >
            <header>
              <div>
                <span>已识别 · {preview.sourceLabel}</span>
                <h2 id="migration-title">搬家前看一眼</h2>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setPreview(null)}
              >
                ×
              </button>
            </header>
            <p className="migration-lead">
              旧资料还没有写入。确认后只会加入新内容，不会覆盖兔兔手机里已有的资料。
            </p>
            <div className="migration-groups">
              {groups.map((group) => (
                <div className="migration-group" key={group.label}>
                  <div>
                    <strong>{group.label}</strong>
                    <span>
                      {
                        group.items.filter((item) => item.status === "ready")
                          .length
                      }{" "}
                      项可导入
                    </span>
                  </div>
                  {group.items.length ? (
                    <ul>
                      {group.items.slice(0, 5).map((entry) => (
                        <li key={`${group.label}-${entry.sourceId}`}>
                          <span>
                            {String(
                              (entry.item as unknown as Record<string, unknown>)[
                                group.name
                              ],
                            )}
                          </span>
                          <small>
                            {entry.status === "duplicate"
                              ? "已有相同内容，将跳过"
                              : "准备搬入"}
                          </small>
                        </li>
                      ))}
                      {group.items.length > 5 && (
                        <li className="migration-more">
                          还有 {group.items.length - 5} 项
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p>这个资料包里没有{group.label}</p>
                  )}
                </div>
              ))}
            </div>
            {preview.warnings.length > 0 && (
              <div className="migration-warnings">
                {preview.warnings.map((warning) => (
                  <p key={warning}>◎ {warning}</p>
                ))}
              </div>
            )}
            <footer>
              <button type="button" onClick={() => setPreview(null)}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                disabled={readyCount === 0}
                onClick={confirmImport}
              >
                {readyCount > 0 ? `确认搬入 ${readyCount} 项` : "没有新资料"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
