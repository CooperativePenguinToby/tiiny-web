import type { NavItemConfig } from "@/types/nav";
import { paths } from "@/paths";

export const navItems = [
	{ key: "overview", title: "Overview", href: paths.dashboard.overview, icon: "chart-pie" },
	{ key: "models", title: "Models", href: paths.dashboard.models, icon: "cpu" },
	{ key: "chat", title: "Chat", href: paths.dashboard.chat, icon: "chat-circle-text" },
] satisfies NavItemConfig[];
