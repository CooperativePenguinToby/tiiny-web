"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { ListIcon } from "@phosphor-icons/react/dist/ssr/List";
import { SignOutIcon } from "@phosphor-icons/react/dist/ssr/SignOut";

import { paths } from "@/paths";

import { MobileNav } from "./mobile-nav";

export function MainNav(): React.JSX.Element {
	const router = useRouter();
	const [openNav, setOpenNav] = React.useState<boolean>(false);

	const handleSignOut = React.useCallback(async (): Promise<void> => {
		await fetch("/api/auth/logout", { method: "POST" });
		router.replace(paths.auth.signIn);
	}, [router]);

	return (
		<React.Fragment>
			<Box
				component="header"
				sx={{
					borderBottom: "1px solid var(--mui-palette-divider)",
					backgroundColor: "var(--mui-palette-background-paper)",
					position: "sticky",
					top: 0,
					zIndex: "var(--mui-zIndex-appBar)",
				}}
			>
				<Stack
					direction="row"
					spacing={2}
					sx={{ alignItems: "center", justifyContent: "space-between", minHeight: "64px", px: 2 }}
				>
					<IconButton
						aria-label="Open navigation"
						onClick={(): void => {
							setOpenNav(true);
						}}
						sx={{ visibility: { lg: "hidden" } }}
					>
						<ListIcon />
					</IconButton>
					<Button
						color="secondary"
						onClick={handleSignOut}
						startIcon={<SignOutIcon fontSize="var(--icon-fontSize-md)" />}
					>
						Sign out
					</Button>
				</Stack>
			</Box>
			<MobileNav
				onClose={() => {
					setOpenNav(false);
				}}
				open={openNav}
			/>
		</React.Fragment>
	);
}
