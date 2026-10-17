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
	},
} as const;
