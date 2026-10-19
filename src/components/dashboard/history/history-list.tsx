"use client";

import * as React from "react";
import RouterLink from "next/link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { ConversationSummary } from "@/types/device";
import { paths } from "@/paths";
import { postJson } from "@/lib/api";
import { responseError } from "@/lib/sse";
import { useFormat } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

type Found = ConversationSummary & { snippet?: string };

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function HistoryList(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const all = usePolling<ConversationSummary[]>("/api/history", 30_000);
	const [query, setQuery] = React.useState("");
	const [found, setFound] = React.useState<{ query: string; items: Found[] } | null>(null);
	const [searching, setSearching] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const [deleting, setDeleting] = React.useState<ConversationSummary | null>(null);

	const search = async (): Promise<void> => {
		const text = query.trim();
		if (!text) {
			setFound(null);
			return;
		}
		setSearching(true);
		setError(null);
		try {
			const response = await fetch(`/api/history/search?q=${encodeURIComponent(text)}`);
			if (!response.ok) throw new Error(await responseError(response));
			setFound({ query: text, items: (await response.json()) as Found[] });
		} catch (error_) {
			setError(errorMessage(error_));
		} finally {
			setSearching(false);
		}
	};

	const remove = async (conversation: ConversationSummary): Promise<void> => {
		setDeleting(null);
		try {
			await postJson("/api/history/delete", { conversationId: conversation.conversationId });
			setFound((current) =>
				current
					? { ...current, items: current.items.filter((item) => item.conversationId !== conversation.conversationId) }
					: null
			);
			await all.refresh();
		} catch (error_) {
			setError(errorMessage(error_));
		}
	};

	const items: Found[] | null = found ? found.items : all.data;

	return (
		<Stack spacing={3}>
			<Stack
				component="form"
				direction="row"
				onSubmit={(event) => {
					event.preventDefault();
					void search();
				}}
				spacing={1}
			>
				<TextField
					fullWidth
					label={t("chat.history.search")}
					onChange={(event) => {
						setQuery(event.target.value);
						if (!event.target.value.trim()) setFound(null);
					}}
					size="small"
					value={query}
				/>
				<Button disabled={searching} type="submit" variant="contained">
					{t(searching ? "chat.history.searching" : "chat.history.searchButton")}
				</Button>
			</Stack>
			{error ? (
				<Alert onClose={() => setError(null)} severity="error">
					{error}
				</Alert>
			) : null}
			{all.error && !all.data ? <Alert severity="error">{all.error}</Alert> : null}
			{items === null ? (
				all.isLoading ? (
					<Stack sx={{ alignItems: "center", py: 6 }}>
						<CircularProgress aria-label={t("chat.history.loading")} />
					</Stack>
				) : null
			) : items.length === 0 ? (
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{found ? t("chat.history.noMatches", { query: found.query }) : t("chat.history.empty")}
				</Typography>
			) : (
				<Card>
					<Stack divider={<Divider />}>
						{items.map((conversation) => (
							<Stack
								data-testid={`conversation-${conversation.conversationId}`}
								direction="row"
								key={conversation.conversationId}
								spacing={2}
								sx={{ alignItems: "center", px: 3, py: 2 }}
							>
								<Stack spacing={0.5} sx={{ flex: "1 1 auto", minWidth: 0 }}>
									<Typography
										component={RouterLink}
										href={`${paths.dashboard.chat}?c=${encodeURIComponent(conversation.conversationId)}`}
										sx={{ color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
										variant="subtitle2"
									>
										{conversation.title || t("chat.history.untitled")}
									</Typography>
									{conversation.snippet ? (
										<Typography
											noWrap
											variant="body2"
											sx={{
												color: "text.secondary",
											}}
										>
											…{conversation.snippet}…
										</Typography>
									) : null}
									<Typography
										variant="caption"
										sx={{
											color: "text.secondary",
										}}
									>
										{format.date(conversation.updatedAt).format("D MMM YYYY HH:mm")}
									</Typography>
								</Stack>
								<Button color="error" onClick={() => setDeleting(conversation)} size="small">
									{t("chat.history.delete")}
								</Button>
							</Stack>
						))}
					</Stack>
				</Card>
			)}
			<ConfirmDialog
				confirmLabel={t("chat.history.delete")}
				onCancel={() => setDeleting(null)}
				onConfirm={() => deleting && void remove(deleting)}
				open={deleting !== null}
				text={t("chat.history.confirmText", { title: deleting?.title ?? "" })}
				title={t("chat.history.confirmTitle")}
			/>
		</Stack>
	);
}
