"use client";

import * as React from "react";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";

import { VaultFiles } from "./vault-files";
import { VaultMemory } from "./vault-memory";

export function VaultTabs(): React.JSX.Element {
	const [tab, setTab] = React.useState<"files" | "history">("files");
	return (
		<>
			<Tabs onChange={(_event, value: "files" | "history") => setTab(value)} value={tab}>
				<Tab label="Files" value="files" />
				<Tab label="Chat history" value="history" />
			</Tabs>
			{tab === "files" ? <VaultFiles /> : <VaultMemory />}
		</>
	);
}
