"use client";

import * as React from "react";
import RouterLink from "next/link";
import Button from "@mui/material/Button";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";

import { paths } from "@/paths";

// A client component, because a server page cannot hand next/link to MUI as its `component`.
export function BackHomeButton(): React.JSX.Element {
	return (
		<Button
			component={RouterLink}
			href={paths.home}
			startIcon={<ArrowLeftIcon fontSize="var(--icon-fontSize-md)" />}
			variant="contained"
		>
			Go back to home
		</Button>
	);
}
