"use client";

import * as React from "react";
import Button from "@mui/material/Button";

export function CopyButton({ text, label }: { text: string; label: string }): React.JSX.Element {
	const [copied, setCopied] = React.useState(false);
	return (
		<Button
			aria-label={label}
			onClick={() => {
				void navigator.clipboard.writeText(text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
			size="small"
		>
			{copied ? "Copied" : "Copy"}
		</Button>
	);
}
