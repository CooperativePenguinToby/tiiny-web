import type { NavItemConfig } from "@/types/nav";
import { paths } from "@/paths";

export const navItems = [
	{ key: "overview", title: "nav.overview", href: paths.dashboard.overview, icon: "chart-pie" },
	{
		key: "models",
		title: "nav.models",
		href: paths.dashboard.models,
		icon: "cpu",
		matcher: { type: "startsWith", href: paths.dashboard.models },
	},
	{ key: "agents", title: "nav.agents", href: paths.dashboard.agents, icon: "robot" },
	{
		key: "chat",
		title: "nav.chat",
		href: paths.dashboard.chat,
		icon: "chat-circle-text",
		matcher: { type: "startsWith", href: paths.dashboard.chat },
	},
	{ key: "playground", title: "nav.playground", href: paths.dashboard.playground, icon: "flask" },
	{ key: "vault", title: "nav.vault", href: paths.dashboard.vault, icon: "vault" },
	{ key: "connectors", title: "nav.connectors", href: paths.dashboard.connectors, icon: "plugs-connected" },
	{ key: "settings", title: "nav.settings", href: paths.dashboard.settings, icon: "gear-six" },
] satisfies NavItemConfig[];
