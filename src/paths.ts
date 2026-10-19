export const paths = {
	home: "/",
	auth: { signIn: "/auth/sign-in" },
	dashboard: {
		overview: "/dashboard",
		models: "/dashboard/models",
		store: "/dashboard/models/store",
		huggingFace: "/dashboard/models/hugging-face",
		agents: "/dashboard/agents",
		chat: "/dashboard/chat",
		history: "/dashboard/history",
		vault: "/dashboard/vault",
		connectors: "/dashboard/connectors",
		playground: "/dashboard/playground",
		settings: "/dashboard/settings",
	},
} as const;
