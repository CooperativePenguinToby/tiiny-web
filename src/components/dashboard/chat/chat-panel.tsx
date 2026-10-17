"use client";

import * as React from "react";
import RouterLink from "next/link";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/ssr/PaperPlaneRight";
import { StopIcon } from "@phosphor-icons/react/dist/ssr/Stop";

import type { ChatMessage, ChatModel, ThinkingSetting } from "@/types/device";
import { paths } from "@/paths";
import { readSse, responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

interface Turn extends ChatMessage {
	reasoning?: string;
	note?: string;
}

type Phase = "idle" | "waiting" | "streaming";

interface ChunkDelta {
	choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
	error?: { message?: string };
}

function useElapsedSeconds(running: boolean): number {
	const [seconds, setSeconds] = React.useState(0);
	React.useEffect(() => {
		if (!running) return;
		setSeconds(0);
		const started = Date.now();
		const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
		return () => {
			clearInterval(timer);
		};
	}, [running]);
	return seconds;
}

function MessageBubble({ turn }: { turn: Turn }): React.JSX.Element {
	const isUser = turn.role === "user";
	return (
		<Box
			data-testid={`message-${turn.role}`}
			sx={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: { xs: "100%", md: "80%" } }}
		>
			<Typography color="text.secondary" variant="caption">
				{isUser ? "You" : "Assistant"}
			</Typography>
			{turn.reasoning ? (
				<Accordion disableGutters sx={{ mb: 1 }} variant="outlined">
					<AccordionSummary expandIcon={<CaretDownIcon />}>
						<Typography color="text.secondary" variant="body2">
							Thinking
						</Typography>
					</AccordionSummary>
					<AccordionDetails>
						<Typography color="text.secondary" data-testid="reasoning" sx={{ whiteSpace: "pre-wrap" }} variant="body2">
							{turn.reasoning}
						</Typography>
					</AccordionDetails>
				</Accordion>
			) : null}
			<Box
				sx={{
					bgcolor: isUser ? "var(--mui-palette-primary-main)" : "var(--mui-palette-background-level1)",
					borderRadius: 2,
					color: isUser ? "var(--mui-palette-primary-contrastText)" : "inherit",
					px: 2,
					py: 1.5,
				}}
			>
				<Typography data-testid="message-content" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
					{turn.content}
				</Typography>
			</Box>
			{turn.note ? (
				<Typography color="text.secondary" variant="caption">
					{turn.note}
				</Typography>
			) : null}
		</Box>
	);
}

export function ChatPanel(): React.JSX.Element {
	const models = usePolling<ChatModel[]>("/api/chat/models", 5000);
	const [modelId, setModelId] = React.useState<string>("");
	const [thinking, setThinking] = React.useState<ThinkingSetting>("off");
	const [turns, setTurns] = React.useState<Turn[]>([]);
	const [draft, setDraft] = React.useState<string>("");
	const [phase, setPhase] = React.useState<Phase>("idle");
	const [error, setError] = React.useState<string | null>(null);
	const abortRef = React.useRef<AbortController | null>(null);
	const elapsed = useElapsedSeconds(phase === "waiting");

	const model = models.data?.find((candidate) => candidate.modelId === modelId) ?? null;

	const chooseModel = React.useCallback((next: ChatModel | undefined): void => {
		setModelId(next?.modelId ?? "");
		setThinking(next && !next.thinking.toggleable && next.thinking.defaultLevel ? next.thinking.defaultLevel : "off");
	}, []);

	React.useEffect(() => {
		if (!models.data || models.data.some((candidate) => candidate.modelId === modelId)) return;
		chooseModel(models.data[0]);
	}, [models.data, modelId, chooseModel]);

	const updateLast = (update: (turn: Turn) => Turn): void => {
		setTurns((current) => [...current.slice(0, -1), update(current.at(-1)!)]);
	};

	const send = async (): Promise<void> => {
		const text = draft.trim();
		if (!text || !model || phase !== "idle") return;
		const history: ChatMessage[] = [
			...turns.map(({ role, content }) => ({ role, content })),
			{ role: "user", content: text },
		];
		setTurns([...history, { role: "assistant", content: "" }]);
		setDraft("");
		setError(null);
		setPhase("waiting");
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const response = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ modelId: model.modelId, messages: history, thinking }),
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(await responseError(response));
			for await (const { data } of readSse(response)) {
				if (data === "[DONE]") break;
				const chunk = JSON.parse(data) as ChunkDelta;
				if (chunk.error) {
					const message = chunk.error.message ?? "The device reported an error";
					// The device gives up on requests that wait too long behind other clients' requests.
					throw new Error(
						/upstream chat stream (timed out|failed)/i.test(message)
							? `The device gave up waiting: the model was busy with other requests. Try again. (${message})`
							: message
					);
				}
				const delta = chunk.choices?.[0]?.delta;
				if (!delta?.content && !delta?.reasoning_content) continue;
				setPhase("streaming");
				updateLast((turn) => ({
					...turn,
					content: turn.content + (delta.content ?? ""),
					reasoning: (turn.reasoning ?? "") + (delta.reasoning_content ?? "") || undefined,
				}));
			}
		} catch (error_) {
			if (controller.signal.aborted) {
				updateLast((turn) => ({ ...turn, note: "Stopped." }));
			} else {
				const message = error_ instanceof Error ? error_.message : String(error_);
				setError(message);
				updateLast((turn) => ({ ...turn, note: "No complete reply." }));
			}
		} finally {
			abortRef.current = null;
			setPhase("idle");
		}
	};

	if (models.isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label="Loading chat models" />
			</Stack>
		);
	}

	if (!models.data || models.data.length === 0) {
		return (
			<Alert
				action={
					<Button color="inherit" component={RouterLink} href={paths.dashboard.models} size="small">
						Models
					</Button>
				}
				severity={models.error ? "error" : "info"}
			>
				{models.error ?? "No chat model is loaded. Load one on the Models page."}
			</Alert>
		);
	}

	const busy = phase !== "idle";
	const others = model?.activeRequests ?? 0;

	return (
		<Stack spacing={3}>
			<Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
				<FormControl sx={{ minWidth: 260 }}>
					<InputLabel id="chat-model-label">Model</InputLabel>
					<Select
						disabled={busy}
						label="Model"
						labelId="chat-model-label"
						onChange={(event) =>
							chooseModel(models.data?.find((candidate) => candidate.modelId === event.target.value))
						}
						value={modelId}
					>
						{models.data.map((candidate) => (
							<MenuItem key={candidate.modelId} value={candidate.modelId}>
								{candidate.name}
							</MenuItem>
						))}
					</Select>
				</FormControl>
				{model?.thinking.supported ? (
					<FormControl sx={{ minWidth: 180 }}>
						<InputLabel id="chat-thinking-label">Thinking</InputLabel>
						<Select
							disabled={busy}
							label="Thinking"
							labelId="chat-thinking-label"
							onChange={(event) => setThinking(event.target.value)}
							value={thinking}
						>
							{model.thinking.toggleable ? <MenuItem value="off">Off</MenuItem> : null}
							{model.thinking.levels.map((level) => (
								<MenuItem key={level} value={level}>
									{level}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				) : null}
				<Box sx={{ flex: "1 1 auto" }} />
				<Button
					disabled={busy || turns.length === 0}
					onClick={() => {
						setTurns([]);
						setError(null);
					}}
				>
					New chat
				</Button>
			</Stack>
			<Card>
				<CardContent>
					<Stack spacing={2} sx={{ minHeight: 240 }}>
						{turns.length === 0 ? (
							<Typography color="text.secondary" sx={{ m: "auto" }} variant="body2">
								Send a message to start chatting with {model?.name ?? "the model"}.
							</Typography>
						) : (
							turns.map((turn, index) => <MessageBubble key={index} turn={turn} />)
						)}
						{phase === "waiting" ? (
							<Stack direction="row" spacing={1} sx={{ alignItems: "center" }} role="status">
								<CircularProgress size={16} />
								<Typography color="text.secondary" variant="body2">
									Waiting for the device · {elapsed}s
									{others > 0
										? ` · the model is busy with ${others} other request${others === 1 ? "" : "s"}, yours is queued`
										: ""}
								</Typography>
							</Stack>
						) : null}
					</Stack>
				</CardContent>
			</Card>
			{error ? (
				<Alert onClose={() => setError(null)} severity="error">
					{error}
				</Alert>
			) : null}
			<Stack
				component="form"
				direction="row"
				onSubmit={(event) => {
					event.preventDefault();
					void send();
				}}
				spacing={2}
				sx={{ alignItems: "flex-end" }}
			>
				<TextField
					disabled={busy}
					fullWidth
					label="Message"
					maxRows={8}
					multiline
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							void send();
						}
					}}
					placeholder="Enter to send, Shift+Enter for a new line"
					value={draft}
				/>
				{busy ? (
					<Button
						color="error"
						onClick={() => abortRef.current?.abort()}
						startIcon={<StopIcon />}
						sx={{ flexShrink: 0 }}
						variant="outlined"
					>
						Stop
					</Button>
				) : (
					<Button
						disabled={!draft.trim() || !model}
						startIcon={<PaperPlaneRightIcon />}
						sx={{ flexShrink: 0 }}
						type="submit"
						variant="contained"
					>
						Send
					</Button>
				)}
			</Stack>
		</Stack>
	);
}
