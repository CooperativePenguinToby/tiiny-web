"use client";

import * as React from "react";
import RouterLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { PaperclipIcon } from "@phosphor-icons/react/dist/ssr/Paperclip";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/ssr/PaperPlaneRight";
import { StopIcon } from "@phosphor-icons/react/dist/ssr/Stop";

import type { Attachment, ChatMessage, ChatModel, Conversation, ThinkingSetting, TurnToSave } from "@/types/device";
import { paths } from "@/paths";
import { postJson } from "@/lib/api";
import { readSse, responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

import { AttachmentChips, DOCUMENT_ACCEPT, MessageAttachments, useAttachments } from "./attachments";

interface Turn extends ChatMessage {
	reasoning?: string;
	note?: string;
}

type Phase = "idle" | "waiting" | "streaming";

interface ChunkDelta {
	choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
	usage?: TurnToSave["usage"];
	error?: { message?: string };
}

// The ?c= conversation id: chats are stored in the device's chat history as they happen.
function useConversationId(): [string | null, (id: string | null) => void] {
	const router = useRouter();
	const params = useSearchParams();
	const id = params.get("c");
	const setId = React.useCallback(
		(next: string | null) =>
			router.replace(next ? `${paths.dashboard.chat}?c=${encodeURIComponent(next)}` : paths.dashboard.chat),
		[router]
	);
	return [id, setId];
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
			<Typography
				color="text.secondary"
				component="div"
				sx={{ textAlign: isUser ? "right" : "left" }}
				variant="caption"
			>
				{isUser ? "You" : "Assistant"}
			</Typography>
			{turn.attachments?.length ? <MessageAttachments attachments={turn.attachments} /> : null}
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
	const [conversationId, setConversationId] = useConversationId();
	// The conversation whose turns are on screen; differs from conversationId while one is being opened.
	const shownRef = React.useRef<string | null>(null);
	const [opening, setOpening] = React.useState(false);
	const [saveError, setSaveError] = React.useState<string | null>(null);
	const files = useAttachments();
	const fileInput = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		if (conversationId === shownRef.current) return;
		shownRef.current = conversationId;
		setError(null);
		setSaveError(null);
		if (!conversationId) {
			setTurns([]);
			return;
		}
		setOpening(true);
		void fetch(`/api/history/${encodeURIComponent(conversationId)}`, { cache: "no-store" })
			.then(async (response) => {
				if (!response.ok) throw new Error(await responseError(response));
				const conversation = (await response.json()) as Conversation;
				setTurns(
					conversation.turns.map((turn) => ({
						role: turn.role,
						content: turn.content,
						...(turn.attachments ? { attachments: turn.attachments } : {}),
						...(turn.reasoning ? { reasoning: turn.reasoning } : {}),
						...(turn.status === "paused" ? { note: "Stopped." } : {}),
					}))
				);
			})
			.catch((error_: unknown) =>
				setError(`Could not open the conversation: ${error_ instanceof Error ? error_.message : String(error_)}`)
			)
			.finally(() => setOpening(false));
	}, [conversationId]);

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
		const attachments = files.attachments;
		if ((!text && attachments.length === 0) || files.uploading.length > 0 || !model || phase !== "idle") return;
		const history: ChatMessage[] = [
			...turns.map(({ role, content, attachments: sent }) => ({
				role,
				content,
				...(sent ? { attachments: sent } : {}),
			})),
			{ role: "user", content: text, ...(attachments.length > 0 ? { attachments } : {}) },
		];
		setTurns([...history, { role: "assistant", content: "" }]);
		setDraft("");
		files.clear();
		setError(null);
		setPhase("waiting");
		const controller = new AbortController();
		abortRef.current = controller;
		const reply = {
			content: "",
			reasoning: "",
			usage: undefined as TurnToSave["usage"],
			thinkingFrom: 0,
			thinkingMs: 0,
		};
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
				if (chunk.usage) reply.usage = chunk.usage;
				const delta = chunk.choices?.[0]?.delta;
				if (!delta?.content && !delta?.reasoning_content) continue;
				if (delta.reasoning_content && !reply.thinkingFrom) reply.thinkingFrom = Date.now();
				if (delta.content && reply.thinkingFrom && !reply.thinkingMs)
					reply.thinkingMs = Date.now() - reply.thinkingFrom;
				reply.content += delta.content ?? "";
				reply.reasoning += delta.reasoning_content ?? "";
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
			// Saved before the next message can be sent, so that one joins the same conversation.
			if (reply.content.trim()) await remember(text, attachments, reply, controller.signal.aborted);
			setPhase("idle");
		}
	};

	const remember = async (
		user: string,
		attachments: Attachment[],
		reply: { content: string; reasoning: string; usage: TurnToSave["usage"]; thinkingMs: number },
		stopped: boolean
	): Promise<void> => {
		const turn: TurnToSave = {
			conversationId: shownRef.current,
			modelId,
			user,
			...(attachments.length > 0 ? { attachments } : {}),
			assistant: {
				content: reply.content,
				stopped,
				...(reply.reasoning ? { reasoning: reply.reasoning } : {}),
				...(reply.thinkingMs ? { thinkingMs: reply.thinkingMs } : {}),
			},
			...(reply.usage ? { usage: reply.usage } : {}),
		};
		try {
			const saved = await postJson<{ conversationId: string }>("/api/history/turn", turn);
			setSaveError(null);
			if (saved.conversationId !== shownRef.current) {
				shownRef.current = saved.conversationId;
				setConversationId(saved.conversationId);
			}
		} catch (error_) {
			setSaveError(`Not saved to history: ${error_ instanceof Error ? error_.message : String(error_)}`);
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
					disabled={busy || (turns.length === 0 && !conversationId)}
					onClick={() => {
						shownRef.current = null;
						setTurns([]);
						setError(null);
						setSaveError(null);
						setConversationId(null);
					}}
				>
					New chat
				</Button>
			</Stack>
			<Card>
				<CardContent>
					<Stack spacing={2} sx={{ minHeight: 240 }}>
						{opening ? (
							<CircularProgress aria-label="Opening the conversation" sx={{ m: "auto" }} />
						) : turns.length === 0 ? (
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
			{saveError ? (
				<Alert onClose={() => setSaveError(null)} severity="warning">
					{saveError}
				</Alert>
			) : null}
			{files.error ? <Alert severity="error">{files.error}</Alert> : null}
			<AttachmentChips attachments={files.attachments} onRemove={files.remove} uploading={files.uploading} />
			<input
				accept={model?.supportsVision ? `image/*,${DOCUMENT_ACCEPT}` : DOCUMENT_ACCEPT}
				aria-label="Files to attach"
				hidden
				multiple
				onChange={(event) => {
					const picked = [...(event.target.files ?? [])];
					event.target.value = "";
					if (picked.length > 0) void files.add(picked);
				}}
				ref={fileInput}
				type="file"
			/>
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
				<Button
					aria-label={model?.supportsVision ? "Attach images or documents" : "Attach documents"}
					disabled={busy}
					onClick={() => fileInput.current?.click()}
					sx={{ flexShrink: 0, minWidth: 0, px: 1.5 }}
					title={model?.supportsVision ? "Attach images or documents" : "Attach documents"}
					variant="outlined"
				>
					<PaperclipIcon />
				</Button>
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
