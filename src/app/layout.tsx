import * as React from "react";
import type { Viewport } from "next";

import "@/styles/global.css";

import { ThemeProvider } from "@/components/core/theme-provider/theme-provider";

export const viewport = { width: "device-width", initialScale: 1 } satisfies Viewport;

interface LayoutProperties {
	children: React.ReactNode;
}

export default function Layout({ children }: LayoutProperties): React.JSX.Element {
	return (
		<html lang="en">
			<body>
				<ThemeProvider>{children}</ThemeProvider>
			</body>
		</html>
	);
}
