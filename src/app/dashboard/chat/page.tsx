import * as React from "react";
import type { Metadata } from "next";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { config } from "@/config";
import { ChatPanel } from "@/components/dashboard/chat/chat-panel";

export const metadata = { title: `Chat | ${config.site.name}` } satisfies Metadata;

export default function Page(): React.JSX.Element {
	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Chat</Typography>
				<Typography color="text.secondary" variant="body2">
					Talk to a loaded model. Chats are kept in the device&apos;s chat history, shared with TiinyOS. The device answers
					one request per model at a time, so replies may queue.
				</Typography>
			</div>
			<React.Suspense>
				<ChatPanel />
			</React.Suspense>
		</Stack>
	);
}
