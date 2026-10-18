export const paths = {
	home: "/",
	auth: { signIn: "/auth/sign-in" },
	dashboard: {
		overview: "/dashboard",
		models: "/dashboard/models",
		store: "/dashboard/store",
		huggingFace: "/dashboard/hugging-face",
		agents: "/dashboard/agents",
		chat: "/dashboard/chat",
		history: "/dashboard/history",
		vault: "/dashboard/vault",
		settings: "/dashboard/settings",
	},
} as const;
