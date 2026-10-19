"use client";

import * as React from "react";
import Stack from "@mui/material/Stack";

import { CompatibleSearch } from "./compatible-search";
import { RepositoryCheck, type RepositoryCheckHandle } from "./repository-check";

export function HuggingFacePanel(): React.JSX.Element {
	const checkRef = React.useRef<RepositoryCheckHandle>(null);

	return (
		<Stack spacing={3}>
			<RepositoryCheck ref={checkRef} />
			<CompatibleSearch
				onCheck={(repositoryId) => {
					checkRef.current?.check(repositoryId);
					scrollTo({ top: 0, behavior: "smooth" });
				}}
			/>
		</Stack>
	);
}
