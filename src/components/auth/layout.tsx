"use client";

import * as React from "react";
import RouterLink from "next/link";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Trans, useTranslation } from "react-i18next";

import { paths } from "@/paths";
import { DynamicLogo } from "@/components/core/logo";

export interface LayoutProperties {
	children: React.ReactNode;
}

export function Layout({ children }: LayoutProperties): React.JSX.Element {
	const { t } = useTranslation();

	return (
		<Box
			sx={{
				display: { xs: "flex", lg: "grid" },
				flexDirection: "column",
				gridTemplateColumns: "1fr 1fr",
				minHeight: "100%",
			}}
		>
			<Box sx={{ display: "flex", flex: "1 1 auto", flexDirection: "column" }}>
				<Box sx={{ p: 3 }}>
					<Box component={RouterLink} href={paths.home} sx={{ display: "inline-block", textDecoration: "none" }}>
						<DynamicLogo colorDark="light" colorLight="dark" height={32} />
					</Box>
				</Box>
				<Box sx={{ alignItems: "center", display: "flex", flex: "1 1 auto", justifyContent: "center", p: 3 }}>
					<Box sx={{ maxWidth: "450px", width: "100%" }}>{children}</Box>
				</Box>
			</Box>
			<Box
				sx={{
					alignItems: "center",
					background: "radial-gradient(50% 50% at 50% 50%, #122647 0%, #090E23 100%)",
					color: "var(--mui-palette-common-white)",
					display: { xs: "none", lg: "flex" },
					justifyContent: "center",
					p: 3,
				}}
			>
				<Stack spacing={1}>
					<Typography
						variant="h1"
						sx={{
							color: "inherit",
							fontSize: "24px",
							lineHeight: "32px",
							textAlign: "center",
						}}
					>
						<Trans
							i18nKey="auth.layout.welcome"
							components={{ brand: <Box component="span" sx={{ color: "#15b79e" }} /> }}
						/>
					</Typography>
					<Typography align="center" variant="subtitle1">
						{t("auth.layout.tagline")}
					</Typography>
				</Stack>
			</Box>
		</Box>
	);
}
