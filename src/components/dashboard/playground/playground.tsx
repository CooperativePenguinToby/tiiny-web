"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { BenchResult, PlaygroundKind, PlaygroundModel } from "@/types/device";
import { postJson } from "@/lib/api";
import { responseError } from "@/lib/sse";
import { usePolling } from "@/hooks/use-polling";

const TABS: { kind: PlaygroundKind; label: string; intro: string }[] = [
	{ kind: "asr", label: "Speech to text", intro: "Transcribe a WAV recording with a speech recognition model." },
	{ kind: "tts", label: "Text to speech", intro: "Turn text into speech with a voice model." },
	{ kind: "ocr", label: "OCR", intro: "Read the text in an image." },
	{ kind: "embed", label: "Embeddings", intro: "Turn texts into vectors and compare how similar they are." },
	{ kind: "rerank", label: "Rerank", intro: "Order documents by how well they answer a query." },
	{ kind: "text", label: "Benchmark", intro: "Measure how fast a text model generates, like tiiny bench." },
];

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function ModelPicker({
	models,
	value,
	onChange,
}: {
	models: PlaygroundModel[];
	value: string;
	onChange: (modelId: string) => void;
}): React.JSX.Element {
	return (
		<TextField
			label="Model"
			onChange={(event) => onChange(event.target.value)}
			select
			size="small"
			sx={{ minWidth: 300 }}
			value={value}
		>
			{models.map((model) => (
				<MenuItem key={model.modelId} value={model.modelId}>
					{model.name}
					{model.loaded ? "" : " (loads when run)"}
				</MenuItem>
			))}
		</TextField>
	);
}

// Runs one request at a time and keeps its error.
function useRun(): { busy: boolean; error: string | null; run: (action: () => Promise<void>) => Promise<void> } {
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const run = async (action: () => Promise<void>): Promise<void> => {
		setBusy(true);
		setError(null);
		try {
			await action();
		} catch (error_) {
			setError(errorMessage(error_));
		} finally {
			setBusy(false);
		}
	};
	return { busy, error, run };
}

async function postForm<T>(url: string, form: FormData): Promise<T> {
	const response = await fetch(url, { method: "POST", body: form });
	if (!response.ok) throw new Error(await responseError(response));
	return (await response.json()) as T;
}

function RunButton({
	busy,
	disabled,
	onClick,
}: {
	busy: boolean;
	disabled: boolean;
	onClick: () => void;
}): React.JSX.Element {
	return (
		<Box>
			<Button
				disabled={busy || disabled}
				onClick={onClick}
				startIcon={busy ? <CircularProgress size={16} /> : undefined}
				variant="contained"
			>
				{busy ? "Running…" : "Run"}
			</Button>
		</Box>
	);
}

function SpeechToText({ model }: { model: string }): React.JSX.Element {
	const [file, setFile] = React.useState<File | null>(null);
	const [text, setText] = React.useState<string | null>(null);
	const { busy, error, run } = useRun();
	return (
		<Stack spacing={2}>
			<Button component="label" sx={{ alignSelf: "flex-start" }} variant="outlined">
				{file ? file.name : "Choose a WAV file"}
				<input
					accept=".wav,audio/wav,audio/x-wav"
					aria-label="Audio file"
					hidden
					onChange={(event) => setFile(event.target.files?.[0] ?? null)}
					type="file"
				/>
			</Button>
			<RunButton
				busy={busy}
				disabled={!file}
				onClick={() =>
					void run(async () => {
						const form = new FormData();
						form.append("model", model);
						form.append("file", file!);
						const reply = await postForm<{ text: string }>("/api/playground/asr", form);
						setText(reply.text);
					})
				}
			/>
			{error ? <Alert severity="error">{error}</Alert> : null}
			{text === null ? null : (
				<Typography data-testid="playground-result" sx={{ whiteSpace: "pre-wrap" }}>
					{text}
				</Typography>
			)}
		</Stack>
	);
}

function TextToSpeech({ model }: { model: string }): React.JSX.Element {
	const [text, setText] = React.useState("");
	const [voice, setVoice] = React.useState("");
	const [audio, setAudio] = React.useState<string | null>(null);
	const { busy, error, run } = useRun();
	React.useEffect(
		() => () => {
			if (audio) URL.revokeObjectURL(audio);
		},
		[audio]
	);
	return (
		<Stack spacing={2}>
			<TextField label="Text" minRows={3} multiline onChange={(event) => setText(event.target.value)} value={text} />
			<TextField
				helperText="Only some voice models need one, e.g. Supertonic."
				label="Voice (optional)"
				onChange={(event) => setVoice(event.target.value)}
				size="small"
				sx={{ maxWidth: 300 }}
				value={voice}
			/>
			<RunButton
				busy={busy}
				disabled={!text.trim()}
				onClick={() =>
					void run(async () => {
						const response = await fetch("/api/playground/tts", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ model, text, voice }),
						});
						if (!response.ok) throw new Error(await responseError(response));
						setAudio(URL.createObjectURL(await response.blob()));
					})
				}
			/>
			{error ? <Alert severity="error">{error}</Alert> : null}
			{audio ? (
				<Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
					<audio controls data-testid="playground-audio" src={audio} />
					<Link download="speech.wav" href={audio}>
						Download
					</Link>
				</Stack>
			) : null}
		</Stack>
	);
}

function Ocr({ model }: { model: string }): React.JSX.Element {
	const [file, setFile] = React.useState<File | null>(null);
	const [result, setResult] = React.useState<{ text: string; lines: { text: string; score: number }[] } | null>(null);
	const { busy, error, run } = useRun();
	return (
		<Stack spacing={2}>
			<Button component="label" sx={{ alignSelf: "flex-start" }} variant="outlined">
				{file ? file.name : "Choose image"}
				<input
					accept="image/*"
					aria-label="Image file"
					hidden
					onChange={(event) => setFile(event.target.files?.[0] ?? null)}
					type="file"
				/>
			</Button>
			<RunButton
				busy={busy}
				disabled={!file}
				onClick={() =>
					void run(async () => {
						const form = new FormData();
						form.append("model", model);
						form.append("file", file!);
						setResult(await postForm("/api/playground/ocr", form));
					})
				}
			/>
			{error ? <Alert severity="error">{error}</Alert> : null}
			{result ? (
				result.lines.length === 0 ? (
					<Typography color="text.secondary">No text found.</Typography>
				) : (
					<Table aria-label="Recognized lines" data-testid="playground-result" size="small">
						<TableBody>
							{result.lines.map((line, index) => (
								<TableRow key={index}>
									<TableCell>{line.text}</TableCell>
									<TableCell align="right" sx={{ color: "text.secondary", width: 100 }}>
										{(line.score * 100).toFixed(0)}%
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)
			) : null}
		</Stack>
	);
}

function Embeddings({ model }: { model: string }): React.JSX.Element {
	const [texts, setTexts] = React.useState("");
	const [result, setResult] = React.useState<{ dimensions: number; similarity: number[][] } | null>(null);
	const { busy, error, run } = useRun();
	const inputs = texts
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return (
		<Stack spacing={2}>
			<TextField
				helperText="One text per line"
				label="Texts"
				minRows={4}
				multiline
				onChange={(event) => setTexts(event.target.value)}
				value={texts}
			/>
			<RunButton
				busy={busy}
				disabled={inputs.length === 0}
				onClick={() => void run(async () => setResult(await postJson("/api/playground/embed", { model, inputs })))}
			/>
			{error ? <Alert severity="error">{error}</Alert> : null}
			{result ? (
				<Stack data-testid="playground-result" spacing={1}>
					<Typography variant="body2">{result.dimensions} dimensions. Cosine similarity:</Typography>
					<Box sx={{ overflowX: "auto" }}>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell />
									{inputs.map((_text, index) => (
										<TableCell align="right" key={index}>
											{index + 1}
										</TableCell>
									))}
								</TableRow>
							</TableHead>
							<TableBody>
								{result.similarity.map((row, index) => (
									<TableRow key={index}>
										<TableCell
											sx={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
										>
											{index + 1}. {inputs[index]}
										</TableCell>
										{row.map((value, column) => (
											<TableCell align="right" data-testid={`similarity-${index}-${column}`} key={column}>
												{value.toFixed(3)}
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Box>
				</Stack>
			) : null}
		</Stack>
	);
}

function Rerank({ model }: { model: string }): React.JSX.Element {
	const [query, setQuery] = React.useState("");
	const [documents, setDocuments] = React.useState("");
	const [results, setResults] = React.useState<{ index: number; document: string; score: number }[] | null>(null);
	const { busy, error, run } = useRun();
	const docs = documents
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return (
		<Stack spacing={2}>
			<TextField label="Query" onChange={(event) => setQuery(event.target.value)} size="small" value={query} />
			<TextField
				helperText="One document per line"
				label="Documents"
				minRows={4}
				multiline
				onChange={(event) => setDocuments(event.target.value)}
				value={documents}
			/>
			<RunButton
				busy={busy}
				disabled={!query.trim() || docs.length < 2}
				onClick={() =>
					void run(async () => {
						const reply = await postJson<{ results: { index: number; document: string; score: number }[] }>(
							"/api/playground/rerank",
							{
								model,
								query,
								documents: docs,
							}
						);
						setResults(reply.results);
					})
				}
			/>
			{error ? <Alert severity="error">{error}</Alert> : null}
			{results ? (
				<Table aria-label="Ranked documents" data-testid="playground-result" size="small">
					<TableBody>
						{results.map((result, rank) => (
							<TableRow key={result.index}>
								<TableCell sx={{ width: 40 }}>{rank + 1}</TableCell>
								<TableCell>{result.document}</TableCell>
								<TableCell align="right" sx={{ color: "text.secondary", width: 100 }}>
									{result.score.toFixed(3)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}
		</Stack>
	);
}

function Benchmark({ model }: { model: string }): React.JSX.Element {
	const [tokens, setTokens] = React.useState(256);
	const [result, setResult] = React.useState<BenchResult | null>(null);
	const { busy, error, run } = useRun();
	return (
		<Stack spacing={2}>
			<TextField
				label="Tokens to generate"
				onChange={(event) => setTokens(Number(event.target.value))}
				size="small"
				slotProps={{ htmlInput: { min: 32, max: 2048, step: 32 } }}
				sx={{ maxWidth: 200 }}
				type="number"
				value={tokens}
			/>
			<RunButton
				busy={busy}
				disabled={false}
				onClick={() => void run(async () => setResult(await postJson("/api/playground/bench", { model, tokens })))}
			/>
			{error ? <Alert severity="error">{error}</Alert> : null}
			{result ? (
				<Table aria-label="Benchmark" data-testid="playground-result" size="small">
					<TableBody>
						<TableRow>
							<TableCell component="th">Generation speed</TableCell>
							<TableCell data-testid="bench-speed">{result.tokensPerSecond.toFixed(1)} tokens/s</TableCell>
						</TableRow>
						<TableRow>
							<TableCell component="th">Time to first token</TableCell>
							<TableCell>{(result.firstTokenMs / 1000).toFixed(2)} s</TableCell>
						</TableRow>
						<TableRow>
							<TableCell component="th">Tokens</TableCell>
							<TableCell>
								{result.promptTokens} in · {result.completionTokens} out · {(result.totalMs / 1000).toFixed(1)} s total
							</TableCell>
						</TableRow>
					</TableBody>
				</Table>
			) : null}
		</Stack>
	);
}

export function Playground(): React.JSX.Element {
	const models = usePolling<PlaygroundModel[]>("/api/playground/models", 15_000);
	const [kind, setKind] = React.useState<PlaygroundKind>("asr");
	const [chosen, setChosen] = React.useState<Partial<Record<PlaygroundKind, string>>>({});
	const tab = TABS.find((entry) => entry.kind === kind)!;
	const available = (models.data ?? []).filter((model) => model.kind === kind);
	const model =
		chosen[kind] && available.some((entry) => entry.modelId === chosen[kind])
			? chosen[kind]!
			: ((available.find((entry) => entry.loaded) ?? available[0])?.modelId ?? "");

	return (
		<Card>
			<Tabs
				onChange={(_event, value: PlaygroundKind) => setKind(value)}
				scrollButtons="auto"
				sx={{ px: 2 }}
				value={kind}
				variant="scrollable"
			>
				{TABS.map((entry) => (
					<Tab key={entry.kind} label={entry.label} value={entry.kind} />
				))}
			</Tabs>
			<Divider />
			<CardContent>
				<Stack spacing={2}>
					<Typography color="text.secondary" variant="body2">
						{tab.intro}
					</Typography>
					{models.error ? <Alert severity="error">{models.error}</Alert> : null}
					{models.data === null ? (
						<CircularProgress aria-label="Loading models" />
					) : available.length === 0 ? (
						<Alert severity="info">No model for this is downloaded. Get one from the Store.</Alert>
					) : (
						<>
							<ModelPicker
								models={available}
								onChange={(modelId) => setChosen({ ...chosen, [kind]: modelId })}
								value={model}
							/>
							{kind === "asr" ? <SpeechToText key={model} model={model} /> : null}
							{kind === "tts" ? <TextToSpeech key={model} model={model} /> : null}
							{kind === "ocr" ? <Ocr key={model} model={model} /> : null}
							{kind === "embed" ? <Embeddings key={model} model={model} /> : null}
							{kind === "rerank" ? <Rerank key={model} model={model} /> : null}
							{kind === "text" ? <Benchmark key={model} model={model} /> : null}
						</>
					)}
				</Stack>
			</CardContent>
		</Card>
	);
}
