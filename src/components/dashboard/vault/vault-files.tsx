"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { useTranslation } from "react-i18next";

import type { VaultEvent, VaultFile, VaultSearchResult } from "@/types/device";
import { postJson } from "@/lib/api";
import { readSse, responseError } from "@/lib/sse";
import { useFormat } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.html";

interface Progress {
	label: string;
	message: string;
	percent: number | null;
}

// Search hits start with "Source file: …" / "Source title: …" lines (shown as the heading instead) and keep
// the Markdown escapes of the original document.
const hitText = (content: string): string =>
	content
		.replace(/^(Source (file|title): [^\n]*\n)+\n?/, "")
		.replaceAll(/\\([\\`*_{}[\]()#+\-.!|])/g, "$1")
		.trim();

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Reads a device upload/index stream, reporting progress, until it ends; throws on an error event
// (with fallbackError when the device gives no message).
async function follow(
	response: Response,
	fallbackError: string,
	onEvent: (event: VaultEvent) => void
): Promise<VaultEvent | null> {
	if (!response.ok) throw new Error(await responseError(response));
	let last: VaultEvent | null = null;
	for await (const { event, data } of readSse(response)) {
		if (event === "heartbeat") continue;
		const update = JSON.parse(data) as VaultEvent;
		if (event === "error" || update.error_type || update.success === false) {
			throw new Error(update.message || update.error || fallbackError);
		}
		last = update;
		onEvent(update);
	}
	return last;
}

function RenameDialog({
	file,
	onCancel,
	onRename,
}: {
	file: VaultFile | null;
	onCancel: () => void;
	onRename: (name: string) => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const [name, setName] = React.useState(file?.filename ?? "");
	return (
		<Dialog fullWidth maxWidth="xs" onClose={onCancel} open={file !== null}>
			<DialogTitle>{t("vault.files.renameDialog.title")}</DialogTitle>
			<DialogContent>
				<TextField
					autoFocus
					fullWidth
					label={t("vault.files.renameDialog.name")}
					margin="dense"
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={onCancel}>{t("vault.files.renameDialog.cancel")}</Button>
				<Button
					disabled={!name.trim() || name === file?.filename}
					onClick={() => onRename(name.trim())}
					variant="contained"
				>
					{t("vault.files.renameDialog.confirm")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function VaultSearch(): React.JSX.Element {
	const { t } = useTranslation();
	const [query, setQuery] = React.useState("");
	const [results, setResults] = React.useState<VaultSearchResult[] | null>(null);
	const [searching, setSearching] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const search = async (): Promise<void> => {
		setSearching(true);
		setError(null);
		try {
			setResults(await postJson<VaultSearchResult[]>("/api/vault/search", { query }));
		} catch (error_) {
			setError(errorMessage(error_));
		} finally {
			setSearching(false);
		}
	};

	return (
		<Card>
			<CardHeader subheader={t("vault.search.subheader")} title={t("vault.search.title")} />
			<Divider />
			<CardContent>
				<Stack spacing={2}>
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
							label={t("vault.search.label")}
							onChange={(event) => setQuery(event.target.value)}
							size="small"
							value={query}
						/>
						<Button disabled={!query.trim() || searching} type="submit" variant="contained">
							{t(searching ? "vault.search.searching" : "vault.search.submit")}
						</Button>
					</Stack>
					{error ? <Alert severity="error">{error}</Alert> : null}
					{results === null ? null : results.length === 0 ? (
						<Typography
							variant="body2"
							sx={{
								color: "text.secondary",
							}}
						>
							{t("vault.search.empty")}
						</Typography>
					) : (
						<Stack divider={<Divider />} spacing={1.5} data-testid="vault-results">
							{results.map((result) => (
								<Stack key={result.entryId} spacing={0.5} data-testid="vault-result">
									<Typography variant="subtitle2">{result.source}</Typography>
									<Typography
										variant="body2"
										sx={{
											color: "text.secondary",
											whiteSpace: "pre-wrap",
											maxHeight: 160,
											overflow: "auto",
										}}
									>
										{hitText(result.content)}
									</Typography>
								</Stack>
							))}
						</Stack>
					)}
				</Stack>
			</CardContent>
		</Card>
	);
}

export function VaultFiles(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const polled = usePolling<VaultFile[]>("/api/vault", 15_000);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [progress, setProgress] = React.useState<Progress | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [renaming, setRenaming] = React.useState<VaultFile | null>(null);
	const [deleting, setDeleting] = React.useState<VaultFile | null>(null);
	const isBusy = progress !== null;

	const index = async (sourceId: string, label: string, isRetry = false): Promise<void> => {
		setProgress({ label, message: t("vault.files.progress.indexing"), percent: null });
		const response = await fetch("/api/vault/index", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourceId }),
		});
		try {
			await follow(response, t("vault.files.errors.device"), (update) => {
				const stage =
					update.stage === "loading_model"
						? t("vault.files.progress.loadingModel")
						: t("vault.files.progress.stage", { stage: update.stage ?? "" });
				const message = update.total_chunks
					? t("vault.files.progress.withChunks", {
							stage,
							processed: update.processed_chunks ?? 0,
							total: update.total_chunks,
						})
					: stage;
				setProgress({ label, message, percent: update.progress_percent ?? null });
			});
		} catch (error) {
			// The device's embedding server now and then fails a request outright; a second try succeeds.
			if (isRetry || !/upstream model server failed/i.test(errorMessage(error))) throw error;
			setProgress({ label, message: t("vault.files.progress.retrying"), percent: null });
			await new Promise((resolve) => setTimeout(resolve, 5000));
			await index(sourceId, label, true);
		}
	};

	const upload = async (files: File[]): Promise<void> => {
		const label = files.length === 1 ? files[0].name : t("vault.files.fileCount", { count: files.length });
		setOutcome(null);
		setProgress({ label, message: t("vault.files.progress.uploading"), percent: 0 });
		try {
			const form = new FormData();
			for (const file of files) form.append("files", file);
			let sourceId: string | null = null;
			await follow(
				await fetch("/api/vault/upload", { method: "POST", body: form }),
				t("vault.files.errors.device"),
				(update) => {
					sourceId = update.source_id ?? sourceId;
					setProgress({
						label,
						message: update.message ?? t("vault.files.progress.uploading"),
						percent: update.progress_percent ?? null,
					});
				}
			);
			if (!sourceId) throw new Error(t("vault.files.errors.uploadUnconfirmed"));
			await polled.refresh();
			await index(sourceId, label);
			setOutcome({ severity: "success", message: t("vault.files.outcome.added", { label }) });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			setProgress(null);
			await polled.refresh();
		}
	};

	const act = async (action: () => Promise<unknown>, done: string): Promise<void> => {
		setOutcome(null);
		try {
			await action();
			setOutcome({ severity: "success", message: done });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			await polled.refresh();
		}
	};

	return (
		<Stack spacing={3}>
			<Card data-testid="vault-files">
				<CardHeader
					action={
						<Button
							disabled={isBusy}
							onClick={() => inputRef.current?.click()}
							startIcon={<UploadSimpleIcon />}
							variant="contained"
						>
							{t("vault.files.upload")}
						</Button>
					}
					subheader={t("vault.files.subheader")}
					title={t("vault.files.title")}
				/>
				<input
					accept={ACCEPT}
					aria-label={t("vault.files.uploadInput")}
					hidden
					multiple
					onChange={(event) => {
						const files = [...(event.target.files ?? [])];
						event.target.value = "";
						if (files.length > 0) void upload(files);
					}}
					ref={inputRef}
					type="file"
				/>
				<Divider />
				<CardContent>
					<Stack spacing={2}>
						{progress ? (
							<Stack spacing={0.5} data-testid="vault-progress">
								<Typography variant="body2">
									{t("vault.files.progress.line", { label: progress.label, message: progress.message })}
								</Typography>
								<LinearProgress
									aria-label={t("vault.files.progress.label")}
									value={progress.percent ?? 0}
									variant={progress.percent === null ? "indeterminate" : "determinate"}
								/>
							</Stack>
						) : null}
						{outcome ? (
							<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
								{outcome.message}
							</Alert>
						) : null}
						{polled.error ? <Alert severity={polled.data ? "warning" : "error"}>{polled.error}</Alert> : null}
						{polled.data === null ? (
							polled.isLoading ? (
								<Stack sx={{ alignItems: "center", py: 4 }}>
									<CircularProgress aria-label={t("vault.files.loading")} />
								</Stack>
							) : null
						) : polled.data.length === 0 ? (
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
								}}
							>
								{t("vault.files.empty")}
							</Typography>
						) : (
							<Box sx={{ overflowX: "auto" }}>
								<Table size="small">
									<TableHead>
										<TableRow>
											<TableCell>{t("vault.files.columns.file")}</TableCell>
											<TableCell align="right">{t("vault.files.columns.size")}</TableCell>
											<TableCell>{t("vault.files.columns.added")}</TableCell>
											<TableCell>{t("vault.files.columns.status")}</TableCell>
											<TableCell align="right" />
										</TableRow>
									</TableHead>
									<TableBody>
										{polled.data.map((file) => (
											<TableRow data-testid={`vault-file-${file.filename}`} key={file.sourceId}>
												<TableCell sx={{ wordBreak: "break-all" }}>{file.filename}</TableCell>
												<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
													{format.bytes(file.sizeBytes)}
												</TableCell>
												<TableCell sx={{ whiteSpace: "nowrap" }}>
													{format.date(file.addedAt).format("D MMM YYYY HH:mm")}
												</TableCell>
												<TableCell>
													{file.indexed ? (
														<Chip color="success" label={t("vault.files.status.indexed")} size="small" />
													) : (
														<Chip
															color={file.indexError ? "error" : "default"}
															label={t(
																file.indexError ? "vault.files.status.indexFailed" : "vault.files.status.notIndexed"
															)}
															size="small"
															title={file.indexError ?? undefined}
														/>
													)}
												</TableCell>
												<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
													{file.indexed ? null : (
														<Button
															disabled={isBusy}
															onClick={() =>
																void act(
																	() => index(file.sourceId, file.filename),
																	t("vault.files.outcome.indexed", { name: file.filename })
																).finally(() => setProgress(null))
															}
															size="small"
														>
															{t("vault.files.actions.index")}
														</Button>
													)}
													<Button
														component="a"
														download
														href={`/api/vault/download?id=${encodeURIComponent(file.sourceId)}`}
														size="small"
													>
														{t("vault.files.actions.download")}
													</Button>
													<Button disabled={isBusy} onClick={() => setRenaming(file)} size="small">
														{t("vault.files.actions.rename")}
													</Button>
													<Button color="error" disabled={isBusy} onClick={() => setDeleting(file)} size="small">
														{t("vault.files.actions.delete")}
													</Button>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</Box>
						)}
					</Stack>
				</CardContent>
			</Card>
			<VaultSearch />
			<RenameDialog
				file={renaming}
				key={renaming?.sourceId ?? ""}
				onCancel={() => setRenaming(null)}
				onRename={(filename) => {
					const file = renaming!;
					setRenaming(null);
					void act(
						() => postJson("/api/vault/rename", { sourceId: file.sourceId, filename }),
						t("vault.files.outcome.renamed", { name: filename })
					);
				}}
			/>
			<ConfirmDialog
				confirmLabel={t("vault.files.deleteDialog.confirm")}
				onCancel={() => setDeleting(null)}
				onConfirm={() => {
					const file = deleting!;
					setDeleting(null);
					void act(
						() => postJson("/api/vault/delete", { sourceId: file.sourceId }),
						t("vault.files.outcome.deleted", { name: file.filename })
					);
				}}
				open={deleting !== null}
				text={t("vault.files.deleteDialog.text", { name: deleting?.filename ?? "" })}
				title={t("vault.files.deleteDialog.title")}
			/>
		</Stack>
	);
}
