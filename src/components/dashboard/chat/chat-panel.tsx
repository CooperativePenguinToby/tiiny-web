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
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { PaperclipIcon } from "@phosphor-icons/react/dist/ssr/Paperclip";
import { PaperPlaneRightIcon } from "@phosphor-icons/react/dist/ssr/PaperPlaneRight";
import { StopIcon } from "@phosphor-icons/react/dist/ssr/Stop";
import { useTranslation } from "react-i18next";

import {
	IMAGE_SIZES,
	type Attachment,
	type ChatMessage,
	type ChatModel,
	type Conversation,
	type ImageEvent,
	type TaskEvent,
	type TaskStep,
	type ThinkingSetting,
	type TurnToSave,
} from "@/types/device";
import { paths } from "@/paths";
import { postJson } from "@/lib/api";
import { loadModel } from "@/lib/models";
import { readSse, responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

import { AttachmentChips, DOCUMENT_ACCEPT, MessageAttachments, useAttachments } from "./attachments";
import { TaskSteps } from "./task-steps";

interface Turn extends ChatMessage {
	// Identifies the turn on screen for as long as it is shown.
	id: string;
	reasoning?: string;
	note?: string;
	steps?: TaskStep[];
}

// Chat answers directly; Task lets the model work in steps with tools (Vault, web pages, MCP).
type Mode = "chat" | "task";
const MODE_KEY = "tiiny-chat-mode";
// Which optional tools Task mode may use; each can be switched off on its own.
interface TaskTools {
	vault: boolean;
	web: boolean;
}
const TOOLS_KEY = "tiiny-task-tools";

// Mode and tools are kept in localStorage, read as an external store: the server render and hydration
// use the defaults, then the client switches to the saved choices.
const preferenceListeners = new Set<() => void>();
const subscribePreferences = (onChange: () => void): (() => void) => {
	preferenceListeners.add(onChange);
	return () => {
		preferenceListeners.delete(onChange);
	};
};
const savePreference = (key: string, value: string): void => {
	localStorage.setItem(key, value);
	for (const listener of preferenceListeners) listener();
};
const readMode = (): Mode => (localStorage.getItem(MODE_KEY) === "task" ? "task" : "chat");
const readSavedTools = (): string => localStorage.getItem(TOOLS_KEY) ?? "{}";
const parseTaskTools = (saved: string): TaskTools => {
	try {
		const tools = JSON.parse(saved) as Partial<TaskTools>;
		return { vault: tools.vault !== false, web: tools.web !== false };
	} catch {
		// keep both on
		return { vault: true, web: true };
	}
};
const chooseMode = (next: Mode): void => {
	savePreference(MODE_KEY, next);
};

type Phase = "idle" | "waiting" | "streaming";
// How a Task-mode reply ended.
type TaskOutcome = "done" | "interrupted";

interface ChunkDelta {
	choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
	usage?: TurnToSave["usage"];
	error?: { message?: string; type?: string };
}

interface Reply {
	content: string;
	reasoning: string;
	usage: TurnToSave["usage"];
	thinkingFrom: number;
	thinkingMs: number;
	// Pictures an image model drew.
	attachments: Attachment[];
	// Tools used in Task mode.
	steps: TaskStep[];
}

// The ?c= conversation id: chats are stored in the device's chat history as they happen.
function useConversationId(): [string | null, (id: string | null) => void] {
	const router = useRouter();
	const parameters = useSearchParams();
	const id = parameters.get("c");
	const setId = React.useCallback(
		(next: string | null) =>
			router.replace(next ? `${paths.dashboard.chat}?c=${encodeURIComponent(next)}` : paths.dashboard.chat),
		[router]
	);
	return [id, setId];
}

function useElapsedSeconds(isRunning: boolean): number {
	const [seconds, setSeconds] = React.useState(0);
	// Counting starts from zero each time the wait starts.
	const [wasRunning, setWasRunning] = React.useState(isRunning);
	if (isRunning !== wasRunning) {
		setWasRunning(isRunning);
		if (isRunning) setSeconds(0);
	}
	React.useEffect(() => {
		if (!isRunning) return;
		const started = Date.now();
		const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
		return () => {
			clearInterval(timer);
		};
	}, [isRunning]);
	return seconds;
}

function MessageBubble({ turn }: { turn: Turn }): React.JSX.Element {
	const { t } = useTranslation();
	const isUser = turn.role === "user";
	return (
		<Box
			data-testid={`message-${turn.role}`}
			sx={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: { xs: "100%", md: "80%" } }}
		>
			<Typography
				component="div"
				variant="caption"
				sx={{
					color: "text.secondary",
					textAlign: isUser ? "right" : "left",
				}}
			>
				{t(isUser ? "chat.message.you" : "chat.message.assistant")}
			</Typography>
			{turn.attachments?.length ? (
				<MessageAttachments align={isUser ? "end" : "start"} attachments={turn.attachments} />
			) : null}
			{turn.steps?.length ? <TaskSteps steps={turn.steps} /> : null}
			{turn.reasoning ? (
				<Accordion disableGutters sx={{ mb: 1 }} variant="outlined">
					<AccordionSummary expandIcon={<CaretDownIcon />}>
						<Typography
							variant="body2"
							sx={{
								color: "text.secondary",
							}}
						>
							{t("chat.message.thinking")}
						</Typography>
					</AccordionSummary>
					<AccordionDetails>
						<Typography
							data-testid="reasoning"
							variant="body2"
							sx={{
								color: "text.secondary",
								whiteSpace: "pre-wrap",
							}}
						>
							{turn.reasoning}
						</Typography>
					</AccordionDetails>
				</Accordion>
			) : null}
			<Box
				sx={{
					display: !turn.content && turn.attachments?.length ? "none" : undefined,
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
				<Typography
					variant="caption"
					sx={{
						color: "text.secondary",
					}}
				>
					{turn.note}
				</Typography>
			) : null}
		</Box>
	);
}

export function ChatPanel(): React.JSX.Element {
	const { t } = useTranslation();
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
	// The ref mirrors it for code that runs after awaits.
	const [shownId, setShownId] = React.useState<string | null>(null);
	const shownIdRef = React.useRef<string | null>(null);
	React.useEffect(() => {
		shownIdRef.current = shownId;
	}, [shownId]);
	const [previousConversationId, setPreviousConversationId] = React.useState<string | null>(null);
	// The conversation being fetched to be shown.
	const [openingId, setOpeningId] = React.useState<string | null>(null);
	const nextTurnIdRef = React.useRef(0);
	const newTurnId = React.useCallback((): string => {
		nextTurnIdRef.current += 1;
		return `turn-${nextTurnIdRef.current}`;
	}, []);
	const [saveError, setSaveError] = React.useState<string | null>(null);
	const files = useAttachments();
	const [imageSize, setImageSize] = React.useState<string>(IMAGE_SIZES[0]);
	const [imageSteps, setImageSteps] = React.useState(9);
	const mode = React.useSyncExternalStore(subscribePreferences, readMode, (): Mode => "chat");
	const taskTools = parseTaskTools(React.useSyncExternalStore(subscribePreferences, readSavedTools, () => "{}"));
	const toggleTool = (tool: keyof TaskTools): void => {
		const isOn = taskTools[tool];
		savePreference(TOOLS_KEY, JSON.stringify({ ...taskTools, [tool]: !isOn }));
	};
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	// When ?c= changes to a conversation other than the one on screen, show that one instead.
	if (conversationId !== previousConversationId) {
		setPreviousConversationId(conversationId);
		if (conversationId !== shownId) {
			setShownId(conversationId);
			setError(null);
			setSaveError(null);
			if (conversationId) setOpeningId(conversationId);
			else setTurns([]);
		}
	}

	React.useEffect(() => {
		if (!openingId) return;
		const controller = new AbortController();
		void fetch(`/api/history/${encodeURIComponent(openingId)}`, { cache: "no-store", signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(await responseError(response));
				const conversation = (await response.json()) as Conversation;
				setTurns(
					conversation.turns.map((turn) => ({
						id: newTurnId(),
						role: turn.role,
						content: turn.content,
						...(turn.attachments && { attachments: turn.attachments }),
						...(turn.steps && { steps: turn.steps }),
						...(turn.reasoning && { reasoning: turn.reasoning }),
						...(turn.status === "paused" && { note: t("chat.notes.stopped") }),
					}))
				);
			})
			.catch((error_: unknown) => {
				if (controller.signal.aborted) return;
				setError(
					t("chat.errors.openConversation", { message: error_ instanceof Error ? error_.message : String(error_) })
				);
			})
			.finally(() => {
				// Unless a newer conversation is being opened instead.
				if (!controller.signal.aborted) setOpeningId(null);
			});
		return () => controller.abort();
	}, [openingId, newTurnId, t]);

	const [loading, setLoading] = React.useState<{ name: string; message: string; progress: number | null } | null>(null);
	const [makeRoom, setMakeRoom] = React.useState<{
		model: ChatModel;
		unload: { modelId: string; name: string }[];
	} | null>(null);

	// Loads a model chosen in chat, first unloading the ones the device says must make room (as agreed).
	const load = async (next: ChatModel, unloadFirst: { modelId: string; name: string }[]): Promise<void> => {
		setError(null);
		setLoading({ name: next.name, message: t("chat.loading.starting"), progress: null });
		try {
			for (const other of unloadFirst) {
				setLoading({ name: next.name, message: t("chat.loading.unloading", { name: other.name }), progress: null });
				await postJson("/api/models/unload", { modelId: other.modelId });
			}
			await loadModel(next.modelId, (message, progress) => setLoading({ name: next.name, message, progress }));
		} catch (error_) {
			setError(
				t("chat.errors.load", { name: next.name, message: error_ instanceof Error ? error_.message : String(error_) })
			);
		} finally {
			setLoading(null);
			await models.refresh();
		}
	};

	const ensureLoaded = async (next: ChatModel): Promise<void> => {
		try {
			const response = await fetch(`/api/models/unload-candidate?modelId=${encodeURIComponent(next.modelId)}`);
			if (!response.ok) throw new Error(await responseError(response));
			const plan = (await response.json()) as {
				unloadRequired: boolean;
				unload: { modelId: string; name: string }[];
			};
			if (plan.unloadRequired) setMakeRoom({ model: next, unload: plan.unload });
			else await load(next, []);
		} catch (error_) {
			setError(
				t("chat.errors.load", { name: next.name, message: error_ instanceof Error ? error_.message : String(error_) })
			);
		}
	};

	const chooseModel = (next: ChatModel | undefined, shouldLoad: boolean): void => {
		setModelId(next?.modelId ?? "");
		setThinking(next && !next.thinking.toggleable && next.thinking.defaultLevel ? next.thinking.defaultLevel : "off");
		if (shouldLoad && next && !next.loaded) void ensureLoaded(next);
	};

	// Starts on a loaded model; with none loaded nothing is preselected, so picking one loads it. (Nothing
	// to change when nothing is chosen and nothing is loaded.)
	const firstLoaded = models.data?.find((candidate) => candidate.loaded);
	if (
		models.data &&
		(firstLoaded?.modelId ?? "") !== modelId &&
		models.data.every((candidate) => candidate.modelId !== modelId)
	) {
		chooseModel(firstLoaded, false);
	}

	const model = models.data?.find((candidate) => candidate.modelId === modelId) ?? null;

	const updateLast = (update: (turn: Turn) => Turn): void => {
		setTurns((current) => [...current.slice(0, -1), update(current.at(-1)!)]);
	};

	const send = async (): Promise<void> => {
		const text = draft.trim();
		const attachments = files.attachments;
		if (
			loading !== null ||
			phase !== "idle" ||
			(!text && attachments.length === 0) ||
			files.uploading.length > 0 ||
			!model?.loaded
		) {
			return;
		}
		// Pictures a model drew are not sent back to text models.
		const earlier: Turn[] = turns.map(({ id, role, content, attachments: sent }) => ({
			id,
			role,
			content,
			...(sent && role === "user" && { attachments: sent }),
		}));
		const message: ChatMessage = { role: "user", content: text, ...(attachments.length > 0 && { attachments }) };
		const history: ChatMessage[] = [...earlier.map(({ id: _id, ...earlierMessage }) => earlierMessage), message];
		setTurns([...earlier, { id: newTurnId(), ...message }, { id: newTurnId(), role: "assistant", content: "" }]);
		setDraft("");
		files.clear();
		setError(null);
		setPhase("waiting");
		const controller = new AbortController();
		abortRef.current = controller;
		let isInterrupted = false;
		const reply: Reply = {
			content: "",
			reasoning: "",
			usage: undefined,
			thinkingFrom: 0,
			thinkingMs: 0,
			attachments: [],
			steps: [],
		};
		try {
			if (model.kind === "image") {
				await draw(text, controller.signal, reply);
				return;
			}
			if (mode === "task") {
				isInterrupted = (await runTask(history, controller.signal, reply)) === "interrupted";
				return;
			}
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
				// Someone interrupted the model (Models page, tiiny interrupt): keep what arrived, like a Stop.
				if (chunk.error?.type === "interrupted") {
					isInterrupted = true;
					break;
				}
				if (chunk.error) {
					const message = chunk.error.message ?? t("chat.errors.device");
					// The device gives up on requests that wait too long behind other clients' requests.
					throw new Error(
						/upstream chat stream (timed out|failed)/i.test(message) ? t("chat.errors.gaveUp", { message }) : message
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
				updateLast((turn) => ({ ...turn, note: t("chat.notes.stopped") }));
			} else {
				const message = error_ instanceof Error ? error_.message : String(error_);
				setError(message);
				updateLast((turn) => ({ ...turn, note: t("chat.notes.noReply") }));
			}
		} finally {
			abortRef.current = null;
			// Saved before the next message can be sent, so that one joins the same conversation.
			if (isInterrupted) updateLast((turn) => ({ ...turn, note: t("chat.notes.interrupted") }));
			if (reply.content.trim() || reply.attachments.length > 0) {
				await remember(text, attachments, reply, controller.signal.aborted || isInterrupted);
			}
			setPhase("idle");
		}
	};

	// Task mode: streams the reply and each tool step; resolves "interrupted" if the model was interrupted.
	const runTask = async (history: ChatMessage[], signal: AbortSignal, reply: Reply): Promise<TaskOutcome> => {
		const response = await fetch("/api/chat/task", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ modelId, messages: history, thinking, tools: taskTools }),
			signal,
		});
		if (!response.ok) throw new Error(await responseError(response));
		const showSteps = (): void => updateLast((turn) => ({ ...turn, steps: [...reply.steps] }));
		// Applies one streamed event; returns how the task ended once it has.
		const apply = (event: TaskEvent): TaskOutcome | undefined => {
			switch (event.type) {
				case "delta": {
					reply.content += event.content ?? "";
					reply.reasoning += event.reasoning ?? "";
					setPhase("streaming");
					updateLast((turn) => ({
						...turn,
						content: turn.content + (event.content ?? ""),
						reasoning: (turn.reasoning ?? "") + (event.reasoning ?? "") || undefined,
					}));
					break;
				}
				case "step": {
					setPhase("streaming");
					reply.steps.push(event.step);
					showSteps();
					break;
				}
				case "step-result": {
					reply.steps = reply.steps.map((step) =>
						step.id === event.id ? { ...step, ok: event.ok, result: event.result } : step
					);
					showSteps();
					break;
				}
				case "usage": {
					reply.usage = event.usage;
					break;
				}
				case "error": {
					if (event.interrupted) return "interrupted";
					throw new Error(event.message);
				}
				case "done": {
					return "done";
				}
			}
			return undefined;
		};
		for await (const { data } of readSse(response)) {
			const outcome = apply(JSON.parse(data) as TaskEvent);
			if (outcome) return outcome;
		}
		return "done";
	};

	// Draws the prompt with an image model, then keeps the picture in the device's media store so the
	// conversation can show it later.
	const draw = async (prompt: string, signal: AbortSignal, reply: Reply): Promise<void> => {
		const response = await fetch("/api/images", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ modelId, prompt, size: imageSize, steps: imageSteps }),
			signal,
		});
		if (!response.ok) throw new Error(await responseError(response));
		let image: string | null = null;
		for await (const { event, data } of readSse(response)) {
			const update = JSON.parse(data) as ImageEvent;
			if (event === "error" || update.status === "error" || update.error) {
				throw new Error(update.error || update.message || t("chat.errors.drawFailed"));
			}
			if (update.total_steps) {
				setPhase("streaming");
				updateLast((turn) => ({
					...turn,
					note: t("chat.notes.drawing", { step: update.step ?? 0, total: update.total_steps }),
				}));
			}
			if (update.image) image = update.image;
		}
		if (!image) throw new Error(t("chat.errors.noPicture"));
		// The device sends a data: URL (older firmware sent bare base64).
		const base64 = image.startsWith("data:") ? image.slice(image.indexOf(",") + 1) : image;
		const bytes = Uint8Array.from(atob(base64), (character) => character.codePointAt(0)!);
		const form = new FormData();
		form.append("file", new File([bytes], `image-${Date.now()}.png`, { type: "image/png" }));
		const stored = await fetch("/api/chat/attachments", { method: "POST", body: form });
		if (!stored.ok) throw new Error(await responseError(stored));
		const picture = (await stored.json()) as Attachment;
		reply.attachments.push(picture);
		updateLast((turn) => ({
			...turn,
			attachments: [picture],
			note: t("chat.notes.picture", { size: imageSize.replace("x", " × "), count: imageSteps }),
		}));
	};

	const remember = async (
		user: string,
		attachments: Attachment[],
		reply: Reply,
		wasStopped: boolean
	): Promise<void> => {
		const turn: TurnToSave = {
			conversationId: shownIdRef.current,
			modelId,
			user,
			...(attachments.length > 0 && { attachments }),
			assistant: {
				content: reply.content,
				stopped: wasStopped,
				...(reply.reasoning && { reasoning: reply.reasoning }),
				...(reply.thinkingMs && { thinkingMs: reply.thinkingMs }),
				...(reply.attachments.length > 0 && { attachments: reply.attachments }),
				...(reply.steps.length > 0 && { steps: reply.steps }),
			},
			...(reply.usage && { usage: reply.usage }),
		};
		try {
			const saved = await postJson<{ conversationId: string }>("/api/history/turn", turn);
			setSaveError(null);
			if (saved.conversationId !== shownIdRef.current) {
				shownIdRef.current = saved.conversationId;
				setShownId(saved.conversationId);
				setConversationId(saved.conversationId);
			}
		} catch (error_) {
			setSaveError(t("chat.errors.notSaved", { message: error_ instanceof Error ? error_.message : String(error_) }));
		}
	};

	if (models.isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label={t("chat.models.loading")} />
			</Stack>
		);
	}

	if (!models.data || models.data.length === 0) {
		return (
			<Alert
				action={
					<Button color="inherit" component={RouterLink} href={paths.dashboard.models} size="small">
						{t("chat.models.modelsButton")}
					</Button>
				}
				severity={models.error ? "error" : "info"}
			>
				{models.error ?? t("chat.models.none")}
			</Alert>
		);
	}

	const isBusy = phase !== "idle" || loading !== null;
	const others = model?.activeRequests ?? 0;

	return (
		<Stack spacing={3}>
			<Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
				<FormControl sx={{ minWidth: 260 }}>
					<InputLabel id="chat-model-label" shrink>
						{t("chat.models.label")}
					</InputLabel>
					<Select
						displayEmpty
						notched
						disabled={isBusy}
						label={t("chat.models.label")}
						labelId="chat-model-label"
						onChange={(event) =>
							chooseModel(
								models.data?.find((candidate) => candidate.modelId === event.target.value),
								true
							)
						}
						renderValue={(value) => {
							const chosen = models.data?.find((candidate) => candidate.modelId === value);
							if (!chosen) return t("chat.models.choose");
							return chosen.loaded ? chosen.name : t("chat.models.notLoadedOption", { name: chosen.name });
						}}
						value={modelId}
					>
						<MenuItem disabled value="">
							{t("chat.models.choose")}
						</MenuItem>
						{models.data.map((candidate) => (
							<MenuItem key={candidate.modelId} value={candidate.modelId}>
								{candidate.loaded ? candidate.name : t("chat.models.notLoadedOption", { name: candidate.name })}
							</MenuItem>
						))}
					</Select>
				</FormControl>
				{model?.kind === "chat" ? (
					<ToggleButtonGroup
						aria-label={t("chat.mode.label")}
						disabled={isBusy}
						exclusive
						onChange={(_event, next: Mode | null) => next && chooseMode(next)}
						size="small"
						sx={{ alignSelf: "center" }}
						value={mode}
					>
						<ToggleButton title={t("chat.mode.chatTitle")} value="chat">
							{t("chat.mode.chat")}
						</ToggleButton>
						<ToggleButton title={t("chat.mode.taskTitle")} value="task">
							{t("chat.mode.task")}
						</ToggleButton>
					</ToggleButtonGroup>
				) : null}
				{mode === "task" && model?.kind === "chat" ? (
					<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
						<FormControlLabel
							control={
								<Switch checked={taskTools.vault} disabled={isBusy} onChange={() => toggleTool("vault")} size="small" />
							}
							label={t("chat.tools.vault")}
							title={t("chat.tools.vaultTitle")}
						/>
						<FormControlLabel
							control={
								<Switch checked={taskTools.web} disabled={isBusy} onChange={() => toggleTool("web")} size="small" />
							}
							label={t("chat.tools.web")}
							title={t("chat.tools.webTitle")}
						/>
					</Stack>
				) : null}
				{model?.kind === "image" ? (
					<>
						<FormControl sx={{ minWidth: 160 }}>
							<InputLabel id="image-size-label">{t("chat.image.size")}</InputLabel>
							<Select
								disabled={isBusy}
								label={t("chat.image.size")}
								labelId="image-size-label"
								onChange={(event) => setImageSize(event.target.value)}
								value={imageSize}
							>
								{IMAGE_SIZES.map((size) => (
									<MenuItem key={size} value={size}>
										{size.replace("x", " × ")}
									</MenuItem>
								))}
							</Select>
						</FormControl>
						<TextField
							disabled={isBusy}
							label={t("chat.image.steps")}
							onChange={(event) => {
								const steps = Number(event.target.value) || 1;
								setImageSteps(Math.min(50, Math.max(1, steps)));
							}}
							slotProps={{ htmlInput: { min: 1, max: 50 } }}
							sx={{ width: 100 }}
							type="number"
							value={imageSteps}
						/>
					</>
				) : null}
				{model?.thinking.supported ? (
					<FormControl sx={{ minWidth: 180 }}>
						<InputLabel id="chat-thinking-label">{t("chat.thinking.label")}</InputLabel>
						<Select
							disabled={isBusy}
							label={t("chat.thinking.label")}
							labelId="chat-thinking-label"
							onChange={(event) => setThinking(event.target.value)}
							value={thinking}
						>
							{model.thinking.toggleable ? <MenuItem value="off">{t("chat.thinking.off")}</MenuItem> : null}
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
					disabled={isBusy || (turns.length === 0 && !conversationId)}
					onClick={() => {
						shownIdRef.current = null;
						setShownId(null);
						setTurns([]);
						setError(null);
						setSaveError(null);
						setConversationId(null);
					}}
				>
					{t("chat.newChat")}
				</Button>
			</Stack>
			{loading ? (
				<Stack data-testid="chat-loading" role="status" spacing={0.5}>
					<Typography variant="body2">
						{loading.progress === null
							? t("chat.loading.status", { name: loading.name, message: loading.message })
							: t("chat.loading.statusProgress", {
									name: loading.name,
									message: loading.message,
									progress: loading.progress.toFixed(0),
								})}
					</Typography>
					<LinearProgress
						aria-label={t("chat.loading.progressLabel")}
						value={loading.progress ?? 0}
						variant={loading.progress === null ? "indeterminate" : "determinate"}
					/>
				</Stack>
			) : model && !model.loaded ? (
				<Alert
					action={
						<Button color="inherit" onClick={() => void ensureLoaded(model)} size="small">
							{t("chat.loading.load")}
						</Button>
					}
					severity="info"
				>
					{t("chat.loading.notLoaded", { name: model.name })}
				</Alert>
			) : null}
			<Dialog onClose={() => setMakeRoom(null)} open={makeRoom !== null}>
				<DialogTitle>{t("chat.makeRoom.title", { name: makeRoom?.model.name })}</DialogTitle>
				<DialogContent>
					<DialogContentText>
						{t("chat.makeRoom.text", {
							models: makeRoom?.unload.map((other) => other.name).join(", ") || t("chat.makeRoom.otherModels"),
						})}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setMakeRoom(null)}>{t("chat.makeRoom.cancel")}</Button>
					<Button
						onClick={() => {
							const plan = makeRoom!;
							setMakeRoom(null);
							void load(plan.model, plan.unload);
						}}
						variant="contained"
					>
						{t("chat.makeRoom.confirm")}
					</Button>
				</DialogActions>
			</Dialog>
			<Card>
				<CardContent>
					<Stack spacing={2} sx={{ minHeight: 240 }}>
						{openingId ? (
							<CircularProgress aria-label={t("chat.conversation.opening")} sx={{ m: "auto" }} />
						) : turns.length === 0 ? (
							<Typography
								variant="body2"
								sx={{
									color: "text.secondary",
									m: "auto",
								}}
							>
								{t("chat.conversation.empty", { name: model?.name ?? t("chat.conversation.theModel") })}
							</Typography>
						) : (
							turns.map((turn) => <MessageBubble key={turn.id} turn={turn} />)
						)}
						{phase === "waiting" ? (
							<Stack direction="row" spacing={1} sx={{ alignItems: "center" }} role="status">
								<CircularProgress size={16} />
								<Typography
									variant="body2"
									sx={{
										color: "text.secondary",
									}}
								>
									{others > 0
										? t("chat.conversation.waitingQueued", { seconds: elapsed, count: others })
										: t("chat.conversation.waiting", { seconds: elapsed })}
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
				aria-label={t("chat.composer.files")}
				hidden
				multiple
				onChange={(event) => {
					const picked = [...(event.target.files ?? [])];
					event.target.value = "";
					if (picked.length > 0) void files.add(picked);
				}}
				ref={fileInputRef}
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
					aria-label={t(
						model?.supportsVision ? "chat.composer.attachImagesOrDocuments" : "chat.composer.attachDocuments"
					)}
					disabled={isBusy || model?.kind === "image"}
					onClick={() => fileInputRef.current?.click()}
					sx={{ flexShrink: 0, minWidth: 0, px: 1.5 }}
					title={t(model?.supportsVision ? "chat.composer.attachImagesOrDocuments" : "chat.composer.attachDocuments")}
					variant="outlined"
				>
					<PaperclipIcon />
				</Button>
				<TextField
					disabled={isBusy}
					fullWidth
					label={t("chat.composer.message")}
					maxRows={8}
					multiline
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) {
							return;
						}

						event.preventDefault();
						void send();
					}}
					placeholder={t("chat.composer.placeholder")}
					value={draft}
				/>
				{isBusy ? (
					<Button
						color="error"
						onClick={() => abortRef.current?.abort()}
						startIcon={<StopIcon />}
						sx={{ flexShrink: 0 }}
						variant="outlined"
					>
						{t("chat.composer.stop")}
					</Button>
				) : (
					<Button
						disabled={(!draft.trim() && files.attachments.length === 0) || files.uploading.length > 0 || !model?.loaded}
						startIcon={<PaperPlaneRightIcon />}
						sx={{ flexShrink: 0 }}
						type="submit"
						variant="contained"
					>
						{t("chat.composer.send")}
					</Button>
				)}
			</Stack>
		</Stack>
	);
}
