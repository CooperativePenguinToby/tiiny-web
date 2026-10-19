"use client";

import * as React from "react";
import RouterLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { PlugIcon } from "@phosphor-icons/react/dist/ssr/Plug";
import { useTranslation } from "react-i18next";

import type { McpServer, McpTool } from "@/types/device";
import { paths } from "@/paths";
import { postJson } from "@/lib/api";
import { responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";
import { RouteTabs } from "@/components/dashboard/layout/route-tabs";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

const EXAMPLE = `{
  "mcpServers": {
    "deepwiki": { "type": "streamableHttp", "url": "https://mcp.deepwiki.com/mcp" }
  }
}`;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Open at its own routes, one per way of adding: by URL, or from JSON.
function AddServerDialog({
	open,
	mode,
	onClose,
	onAdded,
}: {
	open: boolean;
	mode: "url" | "json";
	onClose: () => void;
	onAdded: () => void;
}): React.JSX.Element {
	const { t } = useTranslation();
	const [name, setName] = React.useState("");
	const [url, setUrl] = React.useState("");
	const [json, setJson] = React.useState("");
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	const add = async (): Promise<void> => {
		setBusy(true);
		setError(null);
		try {
			let config: unknown;
			if (mode === "json") {
				try {
					config = JSON.parse(json);
				} catch {
					throw new Error(t("connectors.mcp.addDialog.invalidJson"));
				}
			} else {
				// TiinyOS treats a URL ending in /mcp as streamable HTTP and anything else as SSE.
				const type = /\/mcp\/?$/.test(url.trim()) ? "streamableHttp" : "sse";
				config = { mcpServers: { [name.trim()]: { type, url: url.trim() } } };
			}
			await postJson("/api/mcp", { config });
			onAdded();
		} catch (error_) {
			setError(errorMessage(error_));
		} finally {
			setBusy(false);
		}
	};

	const isValid = mode === "json" ? json.trim().length > 0 : name.trim().length > 0 && /^https?:\/\//.test(url.trim());
	return (
		<Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
			<DialogTitle>{t("connectors.mcp.addDialog.title")}</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<DialogContentText>{t("connectors.mcp.addDialog.description")}</DialogContentText>
					<RouteTabs
						tabs={[
							{ label: t("connectors.mcp.addDialog.byUrl"), href: paths.dashboard.addMcpServer },
							{ label: t("connectors.mcp.addDialog.fromJson"), href: paths.dashboard.addMcpServerJson },
						]}
					/>
					{mode === "url" ? (
						<>
							<TextField
								label={t("connectors.mcp.addDialog.name")}
								onChange={(event) => setName(event.target.value)}
								size="small"
								value={name}
							/>
							<TextField
								helperText={t("connectors.mcp.addDialog.urlHelp", { example: "https://mcp.deepwiki.com/mcp" })}
								label={t("connectors.mcp.addDialog.url")}
								onChange={(event) => setUrl(event.target.value)}
								size="small"
								value={url}
							/>
						</>
					) : (
						<TextField
							label={t("connectors.mcp.addDialog.config")}
							minRows={6}
							multiline
							onChange={(event) => setJson(event.target.value)}
							placeholder={EXAMPLE}
							slotProps={{ htmlInput: { style: { fontFamily: "monospace" } } }}
							value={json}
						/>
					)}
					{error ? <Alert severity="error">{error}</Alert> : null}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>{t("connectors.actions.cancel")}</Button>
				<Button disabled={!isValid || busy} onClick={() => void add()} variant="contained">
					{t(busy ? "connectors.mcp.addDialog.adding" : "connectors.mcp.addDialog.add")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function ServerTools({ id }: { id: string }): React.JSX.Element {
	const { t } = useTranslation();
	const [tools, setTools] = React.useState<McpTool[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	React.useEffect(() => {
		const controller = new AbortController();
		void fetch(`/api/mcp/tools?id=${encodeURIComponent(id)}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(await responseError(response));
				setTools((await response.json()) as McpTool[]);
			})
			.catch((error_: unknown) => {
				if (!controller.signal.aborted) setError(errorMessage(error_));
			});
		return () => controller.abort();
	}, [id]);
	if (error) return <Alert severity="error">{error}</Alert>;
	if (!tools) return <CircularProgress aria-label={t("connectors.mcp.loadingTools")} size={18} />;
	return (
		<Stack data-testid="mcp-tools" spacing={1}>
			{tools.map((tool) => (
				<div key={tool.name}>
					<Typography variant="body2" sx={{ fontFamily: "monospace" }}>
						{tool.name}
					</Typography>
					<Typography
						variant="caption"
						sx={{
							color: "text.secondary",
						}}
					>
						{tool.description.split("\n", 1)[0]}
					</Typography>
				</div>
			))}
		</Stack>
	);
}

export function McpServers(): React.JSX.Element {
	const { t } = useTranslation();
	const polled = usePolling<McpServer[]>("/api/mcp", 15_000);
	const pathname = usePathname();
	const router = useRouter();
	const isAdding = pathname === paths.dashboard.addMcpServer || pathname === paths.dashboard.addMcpServerJson;
	const [shownTools, setShownTools] = React.useState<string | null>(null);
	const [deleting, setDeleting] = React.useState<McpServer | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);

	const remove = async (server: McpServer): Promise<void> => {
		setDeleting(null);
		try {
			await postJson("/api/mcp/delete", { id: server.id });
			setOutcome({ severity: "success", message: t("connectors.mcp.removed", { name: server.name }) });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			await polled.refresh();
		}
	};

	return (
		<Stack spacing={2}>
			<Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
				<Typography variant="h6">{t("connectors.mcp.heading")}</Typography>
				<Button
					component={RouterLink}
					href={paths.dashboard.addMcpServer}
					startIcon={<PlugIcon fontSize="var(--icon-fontSize-md)" />}
					variant="contained"
				>
					{t("connectors.mcp.addServer")}
				</Button>
			</Stack>
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				{t("connectors.mcp.description")}
			</Typography>
			{outcome ? (
				<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
					{outcome.message}
				</Alert>
			) : null}
			{polled.error ? <Alert severity="error">{polled.error}</Alert> : null}
			{polled.data === null ? (
				polled.isLoading ? (
					<CircularProgress aria-label={t("connectors.mcp.loading")} />
				) : null
			) : polled.data.length === 0 ? (
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("connectors.mcp.empty")}
				</Typography>
			) : (
				<Card>
					<Stack divider={<Divider />}>
						{polled.data.map((server) => (
							<Stack data-testid={`mcp-${server.name}`} key={server.id} spacing={1} sx={{ px: 3, py: 2 }}>
								<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
									<PlugIcon aria-hidden color="var(--mui-palette-text-secondary)" fontSize={24} />
									<Typography variant="subtitle2">{server.name}</Typography>
									<Chip
										color={server.connected ? "success" : "error"}
										label={t(server.connected ? "connectors.state.connected" : "connectors.state.notReachable")}
										size="small"
									/>
									<Typography
										variant="caption"
										sx={{
											color: "text.secondary",
											flex: "1 1 auto",
											wordBreak: "break-all",
										}}
									>
										{server.transport} · {server.target}
									</Typography>
									<Button onClick={() => setShownTools(shownTools === server.id ? null : server.id)} size="small">
										{t(shownTools === server.id ? "connectors.mcp.hideTools" : "connectors.mcp.tools")}
									</Button>
									<Button color="error" onClick={() => setDeleting(server)} size="small">
										{t("connectors.actions.remove")}
									</Button>
								</Stack>
								{!server.connected && server.detail ? (
									<Typography color="error" variant="caption">
										{server.detail}
									</Typography>
								) : null}
								{shownTools === server.id ? <ServerTools id={server.id} /> : null}
							</Stack>
						))}
					</Stack>
				</Card>
			)}
			<AddServerDialog
				key={String(isAdding)}
				mode={pathname === paths.dashboard.addMcpServerJson ? "json" : "url"}
				onAdded={() => {
					router.push(paths.dashboard.connectors);
					setOutcome({ severity: "success", message: t("connectors.mcp.added") });
					void polled.refresh();
				}}
				onClose={() => router.push(paths.dashboard.connectors)}
				open={isAdding}
			/>
			<ConfirmDialog
				confirmLabel={t("connectors.actions.remove")}
				onCancel={() => setDeleting(null)}
				onConfirm={() => deleting && void remove(deleting)}
				open={deleting !== null}
				text={t("connectors.mcp.removeDialog.text", { name: deleting?.name ?? "" })}
				title={t("connectors.mcp.removeDialog.title")}
			/>
		</Stack>
	);
}
