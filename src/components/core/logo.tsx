"use client";

import * as React from "react";
import { useColorScheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";

import { NoSsr } from "@/components/core/no-ssr";

type Color = "dark" | "light";

export interface LogoProperties {
	color?: Color;
	height?: number;
}

export function Logo({ color = "dark", height = 32 }: LogoProperties): React.JSX.Element {
	return (
		<Typography
			component="span"
			sx={{
				color: color === "light" ? "var(--mui-palette-common-white)" : "var(--mui-palette-neutral-900)",
				fontSize: `${height * 0.8}px`,
				fontWeight: 700,
				letterSpacing: "-0.02em",
				lineHeight: `${height}px`,
			}}
		>
			tiiny
			<Typography component="span" sx={{ color: "var(--mui-palette-primary-main)", font: "inherit" }}>
				.web
			</Typography>
		</Typography>
	);
}

export interface DynamicLogoProperties {
	colorDark?: Color;
	colorLight?: Color;
	height?: number;
}

export function DynamicLogo({
	colorDark = "light",
	colorLight = "dark",
	height = 32,
}: DynamicLogoProperties): React.JSX.Element {
	const { colorScheme } = useColorScheme();
	const color = colorScheme === "dark" ? colorDark : colorLight;

	return (
		<NoSsr fallback={<span style={{ display: "inline-block", height }} />}>
			<Logo color={color} height={height} />
		</NoSsr>
	);
}
