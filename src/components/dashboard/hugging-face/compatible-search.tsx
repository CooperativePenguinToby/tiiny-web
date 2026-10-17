"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { HfRepo, StoreModel } from "@/types/device";
import { responseError } from "@/lib/sse";
import { useDeviceChecks, type Check } from "@/hooks/use-device-checks";

export interface CompatibleSearchProps {
	onCheck: (repoId: string) => void;
}

const LIMIT_OPTIONS = [20, 40, 100];
const SETTINGS_KEY = "tiiny.hfSearch";

interface Settings {
	autoCheck: boolean;
	compatibleOnly: boolean;
	limit: number;
}

const DEFAULT_SETTINGS: Settings = { autoCheck: true, compatibleOnly: true, limit: 40 };

function useSettings(): [Settings, (change: Partial<Settings>) => void] {
	const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
	React.useEffect(() => {
		try {
			const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>;
			setSettings({ ...DEFAULT_SETTINGS, ...stored });
		} catch {
			// unreadable settings: keep the defaults
		}
	}, []);
	const update = React.useCallback((change: Partial<Settings>) => {
		setSettings((current) => {
			const next = { ...current, ...change };
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
			return next;
		});
	}, []);
	return [settings, update];
}

// How a store model fares as a base for Hugging Face derivatives, judged by asking the device to
// inspect the base itself.
type BaseGroup = "importable" | "checking" | "not-on-hf" | "unsupported";

const GROUP_ORDER: BaseGroup[] = ["importable", "checking", "not-on-hf", "unsupported"];
const GROUP_TITLES: Record<BaseGroup, string> = {
	importable: "Importable bases",
	checking: "Checking with the device…",
	"not-on-hf": "Not on Hugging Face",
	unsupported: "Not supported for import",
};

function baseGroup(check: Check | undefined): BaseGroup {
	if (!check || check.state === "checking") return "checking";
	if (check.state === "error") return "unsupported";
	if (check.result.verdict !== "incompatible") return "importable";
	return check.result.reasonCode === "HF_METADATA_UNAVAILABLE" ? "not-on-hf" : "unsupported";
}

// Select gives every child option semantics (role, click-to-select). Group headings are not options:
// drop what Select injects so they are neither announced nor clickable as choices.
function GroupHeader({ children, ...injected }: { children: React.ReactNode }): React.JSX.Element {
	const {
		role: _role,
		onClick: _onClick,
		onKeyUp: _onKeyUp,
		selected: _selected,
		...rest
	} = injected as Record<string, unknown>;
	void [_role, _onClick, _onKeyUp, _selected];
	return (
		<ListSubheader {...(rest as object)} aria-selected={undefined} data-value={undefined} role="presentation">
			{children}
		</ListSubheader>
	);
}

function VerdictCell({ check }: { check: Check | undefined }): React.JSX.Element {
	if (!check || check.state === "checking") {
		return (
			<Typography color="text.secondary" variant="body2">
				{check ? "checking…" : "not checked"}
			</Typography>
		);
	}
	if (check.state === "error") {
		return (
			<Typography color="error" title={check.message} variant="body2">
				check failed
			</Typography>
		);
	}
	const { verdict, requiredBaseModel, reason, reasonCode } = check.result;
	if (verdict === "compatible") return <Chip color="success" label="compatible" size="small" />;
	return (
		<Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
			{verdict === "needs-base-model" ? (
				<Chip color="warning" label="needs base model" size="small" />
			) : (
				<Chip color="error" label="not compatible" size="small" />
			)}
			<Typography color="text.secondary" variant="caption">
				{verdict === "needs-base-model" && requiredBaseModel
					? `Download ${requiredBaseModel.name} from the Store first`
					: (reason ?? reasonCode)}
			</Typography>
		</Stack>
	);
}

export function CompatibleSearch({ onCheck }: CompatibleSearchProps): React.JSX.Element {
	const [store, setStore] = React.useState<StoreModel[] | null>(null);
	const [base, setBase] = React.useState<string>("");
	const [query, setQuery] = React.useState<string>("");
	const [repos, setRepos] = React.useState<HfRepo[] | null>(null);
	const [searching, setSearching] = React.useState<boolean>(false);
	const [error, setError] = React.useState<string | null>(null);
	const [settings, updateSettings] = useSettings();

	const storeIds = React.useMemo(() => store?.map((model) => model.modelId) ?? null, [store]);
	const baseChecks = useDeviceChecks(storeIds, true);
	const repoIds = React.useMemo(() => repos?.map((repo) => repo.repoId) ?? null, [repos]);
	const repoChecks = useDeviceChecks(repoIds, settings.autoCheck);

	React.useEffect(() => {
		void (async () => {
			const response = await fetch("/api/store");
			if (!response.ok) {
				setError(await responseError(response));
				return;
			}
			setStore((await response.json()) as StoreModel[]);
		})();
	}, []);

	const grouped = React.useMemo(() => {
		const groups = new Map<BaseGroup, StoreModel[]>(GROUP_ORDER.map((group) => [group, []]));
		for (const model of store ?? []) groups.get(baseGroup(baseChecks[model.modelId]))!.push(model);
		// Within importable bases, ones already on the device come first.
		groups
			.get("importable")!
			.sort((a, b) => Number(a.status === "not_downloaded") - Number(b.status === "not_downloaded"));
		return groups;
	}, [store, baseChecks]);

	// Default to the first importable base on the device once the checks find one.
	React.useEffect(() => {
		if (base) return;
		const first = grouped.get("importable")![0];
		if (first) setBase(first.modelId);
	}, [base, grouped]);

	const search = async (): Promise<void> => {
		setSearching(true);
		setError(null);
		try {
			const params = new URLSearchParams({ base, q: query, limit: String(settings.limit) });
			const response = await fetch(`/api/hf/search?${params.toString()}`);
			if (!response.ok) throw new Error(await responseError(response));
			setRepos((await response.json()) as HfRepo[]);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setSearching(false);
		}
	};

	const baseChecksPending = storeIds !== null && storeIds.some((id) => baseGroup(baseChecks[id]) === "checking");

	return (
		<Card>
			<CardHeader
				subheader="LoRA adapters and fine-tunes on Hugging Face built on a store model, checked against the device."
				title="Find compatible models"
			/>
			<Divider />
			<Stack
				component="form"
				direction={{ xs: "column", md: "row" }}
				onSubmit={(event) => {
					event.preventDefault();
					void search();
				}}
				spacing={2}
				sx={{ p: 2 }}
			>
				<FormControl sx={{ minWidth: 340 }}>
					<InputLabel id="hf-base-label">Base model</InputLabel>
					<Select
						disabled={!store}
						label="Base model"
						labelId="hf-base-label"
						onChange={(event) => setBase(event.target.value)}
						value={base}
					>
						{GROUP_ORDER.flatMap((group) => {
							const models = grouped.get(group)!;
							if (models.length === 0) return [];
							return [
								<GroupHeader key={`group-${group}`}>{GROUP_TITLES[group]}</GroupHeader>,
								...models.map((model) => (
									<MenuItem key={model.modelId} value={model.modelId}>
										{model.modelId}
										{model.status === "not_downloaded" ? "" : " (on device)"}
									</MenuItem>
								)),
							];
						})}
					</Select>
				</FormControl>
				<TextField
					label="Search (optional)"
					onChange={(event) => setQuery(event.target.value)}
					sx={{ flex: "1 1 auto" }}
					value={query}
				/>
				<Button disabled={!base || searching} sx={{ flexShrink: 0 }} type="submit" variant="contained">
					Search Hugging Face
				</Button>
			</Stack>
			{baseChecksPending ? (
				<Typography color="text.secondary" role="status" sx={{ px: 2, pb: 1 }} variant="caption">
					Asking the device which store models can be import bases…
				</Typography>
			) : null}
			<Stack direction="row" spacing={3} sx={{ alignItems: "center", flexWrap: "wrap", px: 2, pb: 2 }}>
				<FormControlLabel
					control={
						<Switch
							checked={settings.autoCheck}
							onChange={(event) => updateSettings({ autoCheck: event.target.checked })}
							slotProps={{ input: { role: "switch" } }}
						/>
					}
					label="Auto-check results"
				/>
				<FormControlLabel
					control={
						<Switch
							checked={settings.compatibleOnly}
							onChange={(event) => updateSettings({ compatibleOnly: event.target.checked })}
							slotProps={{ input: { role: "switch" } }}
						/>
					}
					label="Compatible only"
				/>
				<FormControl size="small" sx={{ minWidth: 160 }}>
					<InputLabel id="hf-limit-label">Results per kind</InputLabel>
					<Select
						label="Results per kind"
						labelId="hf-limit-label"
						onChange={(event) => updateSettings({ limit: Number(event.target.value) })}
						value={settings.limit}
					>
						{LIMIT_OPTIONS.map((option) => (
							<MenuItem key={option} value={option}>
								{option}
							</MenuItem>
						))}
					</Select>
				</FormControl>
			</Stack>
			{searching ? <LinearProgress aria-label="Searching Hugging Face" /> : null}
			{error ? (
				<Alert severity="error" sx={{ m: 2 }}>
					{error}
				</Alert>
			) : null}
			{repos && repos.length > 0 ? (
				<CheckSummary checks={repoChecks} compatibleOnly={settings.compatibleOnly} repos={repos} />
			) : null}
			{repos === null ? null : repos.length === 0 ? (
				<Typography color="text.secondary" sx={{ p: 3 }} variant="body2">
					No adapters or fine-tunes of {base} found on Hugging Face.
				</Typography>
			) : (
				<Box sx={{ overflowX: "auto" }}>
					<Table aria-label="Hugging Face repos" sx={{ minWidth: 700 }}>
						<TableHead>
							<TableRow>
								<TableCell>Repo</TableCell>
								<TableCell>Kind</TableCell>
								<TableCell align="right">Downloads</TableCell>
								<TableCell>Compatibility</TableCell>
								<TableCell align="right">Action</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{visibleRepos(repos, repoChecks, settings.compatibleOnly).map((repo) => (
								<TableRow hover key={`${repo.relation}:${repo.repoId}`} data-testid={`hf-${repo.repoId}`}>
									<TableCell>
										<Link
											href={`https://huggingface.co/${repo.repoId}`}
											rel="noreferrer"
											target="_blank"
											variant="subtitle2"
										>
											{repo.repoId}
										</Link>
									</TableCell>
									<TableCell>
										<Chip label={repo.relation === "adapter" ? "LoRA adapter" : "fine-tune"} size="small" />
									</TableCell>
									<TableCell align="right">{repo.downloads.toLocaleString()}</TableCell>
									<TableCell data-testid="hf-verdict-cell">
										<VerdictCell check={repoChecks[repo.repoId]} />
									</TableCell>
									<TableCell align="right">
										<Button onClick={() => onCheck(repo.repoId)} size="small">
											Details
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</Box>
			)}
		</Card>
	);
}

const isIncompatible = (check: Check | undefined): boolean =>
	check?.state === "done" && check.result.verdict === "incompatible";

// "Compatible only" hides repos the device has said it cannot import; unchecked ones, and ones that
// only need a base model downloaded, stay visible.
function visibleRepos(repos: HfRepo[], checks: Record<string, Check>, compatibleOnly: boolean): HfRepo[] {
	return compatibleOnly ? repos.filter((repo) => !isIncompatible(checks[repo.repoId])) : repos;
}

function CheckSummary({
	repos,
	checks,
	compatibleOnly,
}: {
	repos: HfRepo[];
	checks: Record<string, Check>;
	compatibleOnly: boolean;
}): React.JSX.Element {
	const ids = [...new Set(repos.map((repo) => repo.repoId))];
	const finished = ids.filter((id) => checks[id]?.state === "done" || checks[id]?.state === "error").length;
	const count = (verdict: string): number =>
		ids.filter((id) => {
			const check = checks[id];
			return check?.state === "done" && check.result.verdict === verdict;
		}).length;
	const checking = ids.some((id) => checks[id]?.state === "checking");
	const hidden = repos.length - visibleRepos(repos, checks, compatibleOnly).length;
	const needsBase = count("needs-base-model");
	return (
		<Stack spacing={1} sx={{ px: 2, pb: 2 }}>
			<Typography color="text.secondary" data-testid="hf-check-summary" role="status" variant="body2">
				Checked {finished} of {ids.length} · {count("compatible")} compatible
				{needsBase > 0 ? ` · ${needsBase} need a base model` : ""}
				{hidden > 0 ? ` · ${hidden} incompatible hidden` : ""}
			</Typography>
			{checking ? (
				<LinearProgress
					aria-label="Checking compatibility"
					value={(finished / ids.length) * 100}
					variant="determinate"
				/>
			) : null}
		</Stack>
	);
}
