export interface BeautySettings {
  schemaVersion: 1;
  wallpaperReference: string;
  wallpaperPosition: "center" | "top" | "bottom";
  wallpaperDim: number;
  desktopCss: string;
  chatCss: string;
  updatedAt: number;
}
