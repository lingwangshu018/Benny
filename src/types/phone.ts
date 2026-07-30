export type AppId =
  | "微信"
  | "预设"
  | "世界书"
  | "设置"
  | "美化"
  | "角色档案"
  | "记忆宫殿"
  | "资料库"
  | "数据保险箱"
  | "连接工作台"
  | "短信"
  | "番茄钟"
  | "春日农场"
  | "游戏"
  | "小剧场"
  | "小组件";

export interface PhoneApp {
  id: AppId;
  legacyPage: string;
  icon: string;
  accent: string;
}
