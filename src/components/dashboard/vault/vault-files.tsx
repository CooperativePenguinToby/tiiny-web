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
import dayjs from "dayjs";

import type { VaultEvent, VaultFile, VaultSearchResult } from "@/types/device";
import { postJson } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { readSse, responseError } from "@/lib/sse";
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

// Reads a device upload/index stream, reporting progress, until it ends; throws on an error event.
async function follow(response: Response, onEvent: (event: VaultEvent) => void): Promise<VaultEvent | null> {
	if (!response.ok) throw new Error(await responseError(response));
	let last: VaultEvent | null = null;
	for await (const { event, data } of readSse(response)) {
		if (event === "heartbeat") continue;
		const update = JSON.parse(data) as VaultEvent;
		if (event === "error" || update.error_type || update.success === false) {
			throw new Error(update.message || update.error || "The device reported an error");
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
	const [name, setName] = React.useState(file?.filename ?? "");
	return (
		<Dialog fullWidth maxWidth="xs" onClose={onCancel} open={file !== null}>
			<DialogTitle>Rename file</DialogTitle>
			<DialogContent>
				<TextField
					autoFocus
					fullWidth
					label="File name"
					margin="dense"
					onChange={(event) => setName(event.target.value)}
					value={name}
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={onCancel}>Cancel</Button>
				<Button
					disabled={!name.trim() || name === file?.filename}
					onClick={() => onRename(name.trim())}
					variant="contained"
				>
					Rename
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function VaultSearch(): React.JSX.Element {
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
			<CardHeader subheader="What models find when they search Vault" title="Search Vault" />
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
							label="Search"
							onChange={(event) => setQuery(event.target.value)}
							size="small"
							value={query}
						/>
						<Button disabled={!query.trim() || searching} type="submit" variant="contained">
							{searching ? "Searching…" : "Search"}
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
							Nothing relevant found.
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
	const polled = usePolling<VaultFile[]>("/api/vault", 15_000);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [progress, setProgress] = React.useState<Progress | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);
	const [renaming, setRenaming] = React.useState<VaultFile | null>(null);
	const [deleting, setDeleting] = React.useState<VaultFile | null>(null);
	const isBusy = progress !== null;

	const index = async (sourceId: string, label: string, isRetry = false): Promise<void> => {
		setProgress({ label, message: "Indexing…", percent: null });
		const response = await fetch("/api/vault/index", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourceId }),
		});
		try {
			await follow(response, (update) => {
				const chunks = update.total_chunks ? ` (${update.processed_chunks ?? 0}/${update.total_chunks} chunks)` : "";
				const stage =
					update.stage === "loading_model" ? "Loading the embedding model" : `Indexing: ${update.stage ?? ""}`;
				setProgress({ label, message: `${stage}${chunks}`, percent: update.progress_percent ?? null });
			});
		} catch (error) {
			// The device's embedding server now and then fails a request outright; a second try succeeds.
			if (isRetry || !/upstream model server failed/i.test(errorMessage(error))) throw error;
			setProgress({ label, message: "Indexing failed on the device, trying again…", percent: null });
			await new Promise((resolve) => setTimeout(resolve, 5000));
			await index(sourceId, label, true);
		}
	};

	const upload = async (files: File[]): Promise<void> => {
		const label = files.length === 1 ? files[0].name : `${files.length} files`;
		setOutcome(null);
		setProgress({ label, message: "Uploading…", percent: 0 });
		try {
			const form = new FormData();
			for (const file of files) form.append("files", file);
			let sourceId: string | null = null;
			await follow(await fetch("/api/vault/upload", { method: "POST", body: form }), (update) => {
				sourceId = update.source_id ?? sourceId;
				setProgress({ label, message: update.message ?? "Uploading…", percent: update.progress_percent ?? null });
			});
			if (!sourceId) throw new Error("The device did not confirm the upload");
			await polled.refresh();
			await index(sourceId, label);
			setOutcome({ severity: "success", message: `${label} added to Vault.` });
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
							Upload files
						</Button>
					}
					subheader="PDF, Word, Excel, CSV, text, Markdown or HTML, up to 200 MB each. Models use them in Task mode."
					title="Files"
				/>
				<input
					accept={ACCEPT}
					aria-label="Files to upload"
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
									{progress.label}: {progress.message}
								</Typography>
								<LinearProgress
									aria-label="Vault progress"
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
									<CircularProgress aria-label="Loading Vault files" />
								</Stack>
							) : null
						) : polled.data.length === 0 ? (
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
								}}
							>
								No files yet. Upload documents for models to use.
							</Typography>
						) : (
							<Box sx={{ overflowX: "auto" }}>
								<Table size="small">
									<TableHead>
										<TableRow>
											<TableCell>File</TableCell>
											<TableCell align="right">Size</TableCell>
											<TableCell>Added</TableCell>
											<TableCell>Status</TableCell>
											<TableCell align="right" />
										</TableRow>
									</TableHead>
									<TableBody>
										{polled.data.map((file) => (
											<TableRow data-testid={`vault-file-${file.filename}`} key={file.sourceId}>
												<TableCell sx={{ wordBreak: "break-all" }}>{file.filename}</TableCell>
												<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
													{formatBytes(file.sizeBytes)}
												</TableCell>
												<TableCell sx={{ whiteSpace: "nowrap" }}>
													{dayjs(file.addedAt).format("D MMM YYYY HH:mm")}
												</TableCell>
												<TableCell>
													{file.indexed ? (
														<Chip color="success" label="Indexed" size="small" />
													) : (
														<Chip
															color={file.indexError ? "error" : "default"}
															label={file.indexError ? "Indexing failed" : "Not indexed"}
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
																	`${file.filename} indexed.`
																).finally(() => setProgress(null))
															}
															size="small"
														>
															Index
														</Button>
													)}
													<Button
														component="a"
														download
														href={`/api/vault/download?id=${encodeURIComponent(file.sourceId)}`}
														size="small"
													>
														Download
													</Button>
													<Button disabled={isBusy} onClick={() => setRenaming(file)} size="small">
														Rename
													</Button>
													<Button color="error" disabled={isBusy} onClick={() => setDeleting(file)} size="small">
														Delete
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
						`Renamed to ${filename}.`
					);
				}}
			/>
			<ConfirmDialog
				confirmLabel="Delete"
				onCancel={() => setDeleting(null)}
				onConfirm={() => {
					const file = deleting!;
					setDeleting(null);
					void act(() => postJson("/api/vault/delete", { sourceId: file.sourceId }), `${file.filename} deleted.`);
				}}
				open={deleting !== null}
				text={`Delete ${deleting?.filename ?? ""} and its index from the device? Models will no longer find it.`}
				title="Delete file?"
			/>
		</Stack>
	);
}
