"use client";

import * as React from "react";
import Stack from "@mui/material/Stack";

import { CompatibleSearch } from "./compatible-search";
import { RepoCheck, type RepoCheckHandle } from "./repo-check";

export function HuggingFacePanel(): React.JSX.Element {
	const checkRef = React.useRef<RepoCheckHandle>(null);

	return (
		<Stack spacing={3}>
			<RepoCheck ref={checkRef} />
			<CompatibleSearch
				onCheck={(repoId) => {
					checkRef.current?.check(repoId);
					globalThis.scrollTo({ top: 0, behavior: "smooth" });
				}}
			/>
		</Stack>
	);
}
