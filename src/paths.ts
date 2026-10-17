export const paths = {
	home: "/",
	auth: { signIn: "/auth/sign-in" },
	dashboard: {
		overview: "/dashboard",
		models: "/dashboard/models",
		store: "/dashboard/store",
		huggingFace: "/dashboard/hugging-face",
		chat: "/dashboard/chat",
	},
} as const;
