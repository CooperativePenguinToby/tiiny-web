"use client";

import * as React from "react";
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
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { McpServer, McpTool } from "@/types/device";
import { postJson } from "@/lib/api";
import { responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";
import { ConfirmDialog } from "@/components/dashboard/settings/confirm-dialog";

const EXAMPLE = `{
  "mcpServers": {
    "deepwiki": { "type": "streamableHttp", "url": "https://mcp.deepwiki.com/mcp" }
  }
}`;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function AddServerDialog({
	open,
	onClose,
	onAdded,
}: {
	open: boolean;
	onClose: () => void;
	onAdded: () => void;
}): React.JSX.Element {
	const [mode, setMode] = React.useState<"url" | "json">("url");
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
					throw new Error("That is not valid JSON");
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

	const valid = mode === "json" ? json.trim().length > 0 : name.trim().length > 0 && /^https?:\/\//.test(url.trim());
	return (
		<Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
			<DialogTitle>Add an MCP server</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<DialogContentText>
						The server runs on the device, so it must be reachable from there. Servers that need a desktop or a browser
						will not work on the device.
					</DialogContentText>
					<Tabs onChange={(_event, value: "url" | "json") => setMode(value)} value={mode}>
						<Tab label="By URL" value="url" />
						<Tab label="From JSON" value="json" />
					</Tabs>
					{mode === "url" ? (
						<>
							<TextField label="Name" onChange={(event) => setName(event.target.value)} size="small" value={name} />
							<TextField
								helperText="HTTP or SSE endpoint, e.g. https://mcp.deepwiki.com/mcp"
								label="URL"
								onChange={(event) => setUrl(event.target.value)}
								size="small"
								value={url}
							/>
						</>
					) : (
						<TextField
							label="MCP config"
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
				<Button onClick={onClose}>Cancel</Button>
				<Button disabled={!valid || busy} onClick={() => void add()} variant="contained">
					{busy ? "Adding…" : "Add"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function ServerTools({ id }: { id: string }): React.JSX.Element {
	const [tools, setTools] = React.useState<McpTool[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	React.useEffect(() => {
		void fetch(`/api/mcp/tools?id=${encodeURIComponent(id)}`)
			.then(async (response) => {
				if (!response.ok) throw new Error(await responseError(response));
				setTools((await response.json()) as McpTool[]);
			})
			.catch((error_: unknown) => setError(errorMessage(error_)));
	}, [id]);
	if (error) return <Alert severity="error">{error}</Alert>;
	if (!tools) return <CircularProgress aria-label="Loading tools" size={18} />;
	return (
		<Stack data-testid="mcp-tools" spacing={1}>
			{tools.map((tool) => (
				<div key={tool.name}>
					<Typography variant="body2" sx={{ fontFamily: "monospace" }}>
						{tool.name}
					</Typography>
					<Typography color="text.secondary" variant="caption">
						{tool.description.split("\n")[0]}
					</Typography>
				</div>
			))}
		</Stack>
	);
}

export function McpServers(): React.JSX.Element {
	const polled = usePolling<McpServer[]>("/api/mcp", 15_000);
	const [adding, setAdding] = React.useState(false);
	const [shownTools, setShownTools] = React.useState<string | null>(null);
	const [deleting, setDeleting] = React.useState<McpServer | null>(null);
	const [outcome, setOutcome] = React.useState<{ severity: "success" | "error"; message: string } | null>(null);

	const remove = async (server: McpServer): Promise<void> => {
		setDeleting(null);
		try {
			await postJson("/api/mcp/delete", { id: server.id });
			setOutcome({ severity: "success", message: `${server.name} removed.` });
		} catch (error) {
			setOutcome({ severity: "error", message: errorMessage(error) });
		} finally {
			await polled.refresh();
		}
	};

	return (
		<Stack spacing={2}>
			<Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
				<Typography variant="h6">Custom MCP servers</Typography>
				<Button onClick={() => setAdding(true)} variant="contained">
					Add MCP server
				</Button>
			</Stack>
			<Typography color="text.secondary" variant="body2">
				Tools from these servers are offered to models in Task mode. They run on the device.
			</Typography>
			{outcome ? (
				<Alert onClose={() => setOutcome(null)} severity={outcome.severity}>
					{outcome.message}
				</Alert>
			) : null}
			{polled.error ? <Alert severity="error">{polled.error}</Alert> : null}
			{polled.data === null ? (
				polled.isLoading ? (
					<CircularProgress aria-label="Loading MCP servers" />
				) : null
			) : polled.data.length === 0 ? (
				<Typography color="text.secondary" variant="body2">
					No MCP servers yet.
				</Typography>
			) : (
				<Card>
					<Stack divider={<Divider />}>
						{polled.data.map((server) => (
							<Stack data-testid={`mcp-${server.name}`} key={server.id} spacing={1} sx={{ px: 3, py: 2 }}>
								<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
									<Typography variant="subtitle2">{server.name}</Typography>
									<Chip
										color={server.connected ? "success" : "error"}
										label={server.connected ? "Connected" : "Not reachable"}
										size="small"
									/>
									<Typography
										color="text.secondary"
										sx={{ flex: "1 1 auto", wordBreak: "break-all" }}
										variant="caption"
									>
										{server.transport} · {server.target}
									</Typography>
									<Button onClick={() => setShownTools(shownTools === server.id ? null : server.id)} size="small">
										{shownTools === server.id ? "Hide tools" : "Tools"}
									</Button>
									<Button color="error" onClick={() => setDeleting(server)} size="small">
										Remove
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
				key={String(adding)}
				onAdded={() => {
					setAdding(false);
					setOutcome({ severity: "success", message: "MCP server added." });
					void polled.refresh();
				}}
				onClose={() => setAdding(false)}
				open={adding}
			/>
			<ConfirmDialog
				confirmLabel="Remove"
				onCancel={() => setDeleting(null)}
				onConfirm={() => deleting && void remove(deleting)}
				open={deleting !== null}
				text={`Remove ${deleting?.name ?? ""} from the device? Models can no longer use its tools.`}
				title="Remove MCP server?"
			/>
		</Stack>
	);
}
