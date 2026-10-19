import type { NavItemConfig } from "@/types/nav";
import { paths } from "@/paths";

export const navItems = [
	{ key: "overview", title: "Overview", href: paths.dashboard.overview, icon: "chart-pie" },
	{
		key: "models",
		title: "Models",
		href: paths.dashboard.models,
		icon: "cpu",
		matcher: { type: "startsWith", href: paths.dashboard.models },
	},
	{ key: "agents", title: "Agents", href: paths.dashboard.agents, icon: "robot" },
	{
		key: "chat",
		title: "Chat",
		href: paths.dashboard.chat,
		icon: "chat-circle-text",
		matcher: { type: "startsWith", href: paths.dashboard.chat },
	},
	{ key: "playground", title: "Playground", href: paths.dashboard.playground, icon: "flask" },
	{ key: "vault", title: "Vault", href: paths.dashboard.vault, icon: "vault" },
	{ key: "connectors", title: "Connectors", href: paths.dashboard.connectors, icon: "plugs-connected" },
	{ key: "settings", title: "Settings", href: paths.dashboard.settings, icon: "gear-six" },
] satisfies NavItemConfig[];
