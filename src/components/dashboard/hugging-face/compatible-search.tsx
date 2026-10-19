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
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";

import type { HfRepository, StoreModel } from "@/types/device";
import { responseError } from "@/lib/sse";
import { useFormat } from "@/i18n/client";
import { useDeviceChecks, type Check } from "@/hooks/use-device-checks";

export interface CompatibleSearchProperties {
	onCheck: (repositoryId: string) => void;
}

const LIMIT_OPTIONS = [20, 40, 100];
const SETTINGS_KEY = "tiiny.hfSearch";

interface Settings {
	autoCheck: boolean;
	compatibleOnly: boolean;
	limit: number;
}

const DEFAULT_SETTINGS: Settings = { autoCheck: true, compatibleOnly: true, limit: 40 };

// The settings live in localStorage, read as an external store: the server render and hydration use
// the defaults, then the client switches to the stored settings.
const settingsListeners = new Set<() => void>();
// The last stored value read and its parsed settings: parsing once per stored value keeps the
// snapshot referentially stable between renders.
const settingsCache: { raw: string | null | undefined; settings: Settings } = {
	raw: undefined,
	settings: DEFAULT_SETTINGS,
};

function readSettings(): Settings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (settingsCache.raw !== raw) {
			settingsCache.settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw ?? "{}") as Partial<Settings>) };
			settingsCache.raw = raw;
		}
		return settingsCache.settings;
	} catch {
		// unreadable settings: keep the defaults
		return DEFAULT_SETTINGS;
	}
}

function subscribeSettings(onChange: () => void): () => void {
	settingsListeners.add(onChange);
	return () => settingsListeners.delete(onChange);
}

function updateSettings(change: Partial<Settings>): void {
	localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), ...change }));
	for (const listener of settingsListeners) listener();
}

function useSettings(): [Settings, (change: Partial<Settings>) => void] {
	const settings = React.useSyncExternalStore(subscribeSettings, readSettings, () => DEFAULT_SETTINGS);
	return [settings, updateSettings];
}

// How a store model fares as a base for Hugging Face derivatives, judged by asking the device to
// inspect the base itself.
type BaseGroup = "importable" | "checking" | "not-on-hf" | "unsupported";

const GROUP_ORDER: BaseGroup[] = ["importable", "checking", "not-on-hf", "unsupported"];
const GROUP_TITLES: Record<BaseGroup, ParseKeys> = {
	importable: "models.huggingFace.search.groups.importable",
	checking: "models.huggingFace.search.groups.checking",
	"not-on-hf": "models.huggingFace.search.groups.notOnHf",
	unsupported: "models.huggingFace.search.groups.unsupported",
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
	const { t } = useTranslation();
	if (!check || check.state === "checking") {
		return (
			<Typography
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				{t(check ? "models.huggingFace.search.checking" : "models.huggingFace.search.notChecked")}
			</Typography>
		);
	}
	if (check.state === "error") {
		return (
			<Typography color="error" title={check.message} variant="body2">
				{t("models.huggingFace.search.checkFailed")}
			</Typography>
		);
	}
	const { verdict, requiredBaseModel, reason, reasonCode } = check.result;
	if (verdict === "compatible")
		return <Chip color="success" label={t("models.huggingFace.verdict.compatible")} size="small" />;
	return (
		<Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
			{verdict === "needs-base-model" ? (
				<Chip color="warning" label={t("models.huggingFace.verdict.needsBaseModel")} size="small" />
			) : (
				<Chip color="error" label={t("models.huggingFace.verdict.incompatible")} size="small" />
			)}
			<Typography
				variant="caption"
				sx={{
					color: "text.secondary",
				}}
			>
				{verdict === "needs-base-model" && requiredBaseModel
					? t("models.huggingFace.search.downloadBase", { name: requiredBaseModel.name })
					: (reason ?? reasonCode)}
			</Typography>
		</Stack>
	);
}

export function CompatibleSearch({ onCheck }: CompatibleSearchProperties): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const [store, setStore] = React.useState<StoreModel[] | null>(null);
	const [base, setBase] = React.useState<string>("");
	const [query, setQuery] = React.useState<string>("");
	const [repos, setRepos] = React.useState<HfRepository[] | null>(null);
	const [searching, setSearching] = React.useState<boolean>(false);
	const [error, setError] = React.useState<string | null>(null);
	const [settings, updateSettings] = useSettings();

	const storeIds = React.useMemo(() => store?.map((model) => model.modelId) ?? null, [store]);
	const baseChecks = useDeviceChecks(storeIds, true);
	const repositoryIds = React.useMemo(() => repos?.map((repository) => repository.repoId) ?? null, [repos]);
	const repositoryChecks = useDeviceChecks(repositoryIds, settings.autoCheck);

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
		const models = store ?? [];
		for (const model of models) groups.get(baseGroup(baseChecks[model.modelId]))!.push(model);
		// Within importable bases, ones already on the device come first.
		groups
			.get("importable")!
			.sort((a, b) => Number(a.status === "not_downloaded") - Number(b.status === "not_downloaded"));
		return groups;
	}, [store, baseChecks]);

	// Default to the first importable base on the device once the checks find one (adjusted during
	// render rather than in an effect, so there is no extra commit with no base selected).
	const firstImportable = grouped.get("importable")![0];
	if (!base && firstImportable) setBase(firstImportable.modelId);

	const search = async (): Promise<void> => {
		setSearching(true);
		setError(null);
		try {
			const parameters = new URLSearchParams({ base, q: query, limit: String(settings.limit) });
			const response = await fetch(`/api/hf/search?${parameters.toString()}`);
			if (!response.ok) throw new Error(await responseError(response));
			setRepos((await response.json()) as HfRepository[]);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setSearching(false);
		}
	};

	const baseChecksPending = storeIds !== null && storeIds.some((id) => baseGroup(baseChecks[id]) === "checking");

	return (
		<Card>
			<CardHeader subheader={t("models.huggingFace.search.subheader")} title={t("models.huggingFace.search.title")} />
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
					<InputLabel id="hf-base-label">{t("models.huggingFace.search.baseModel")}</InputLabel>
					<Select
						disabled={!store}
						label={t("models.huggingFace.search.baseModel")}
						labelId="hf-base-label"
						onChange={(event) => setBase(event.target.value)}
						value={base}
					>
						{GROUP_ORDER.flatMap((group) => {
							const models = grouped.get(group)!;
							if (models.length === 0) return [];
							return [
								<GroupHeader key={`group-${group}`}>{t(GROUP_TITLES[group])}</GroupHeader>,
								...models.map((model) => (
									<MenuItem key={model.modelId} value={model.modelId}>
										{model.status === "not_downloaded"
											? model.modelId
											: t("models.huggingFace.search.onDevice", { modelId: model.modelId })}
									</MenuItem>
								)),
							];
						})}
					</Select>
				</FormControl>
				<TextField
					label={t("models.huggingFace.search.query")}
					onChange={(event) => setQuery(event.target.value)}
					sx={{ flex: "1 1 auto" }}
					value={query}
				/>
				<Button disabled={!base || searching} sx={{ flexShrink: 0 }} type="submit" variant="contained">
					{t("models.huggingFace.search.submit")}
				</Button>
			</Stack>
			{baseChecksPending ? (
				<Typography
					role="status"
					variant="caption"
					sx={{
						color: "text.secondary",
						px: 2,
						pb: 1,
					}}
				>
					{t("models.huggingFace.search.checkingBases")}
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
					label={t("models.huggingFace.search.autoCheck")}
				/>
				<FormControlLabel
					control={
						<Switch
							checked={settings.compatibleOnly}
							onChange={(event) => updateSettings({ compatibleOnly: event.target.checked })}
							slotProps={{ input: { role: "switch" } }}
						/>
					}
					label={t("models.huggingFace.search.compatibleOnly")}
				/>
				<FormControl size="small" sx={{ minWidth: 160 }}>
					<InputLabel id="hf-limit-label">{t("models.huggingFace.search.limit")}</InputLabel>
					<Select
						label={t("models.huggingFace.search.limit")}
						labelId="hf-limit-label"
						onChange={(event) => updateSettings({ limit: Number(event.target.value) })}
						value={settings.limit}
					>
						{LIMIT_OPTIONS.map((option) => (
							<MenuItem key={option} value={option}>
								{format.number(option)}
							</MenuItem>
						))}
					</Select>
				</FormControl>
			</Stack>
			{searching ? <LinearProgress aria-label={t("models.huggingFace.search.searching")} /> : null}
			{error ? (
				<Alert severity="error" sx={{ m: 2 }}>
					{error}
				</Alert>
			) : null}
			{repos && repos.length > 0 ? (
				<CheckSummary checks={repositoryChecks} compatibleOnly={settings.compatibleOnly} repos={repos} />
			) : null}
			{repos === null ? null : repos.length === 0 ? (
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
						p: 3,
					}}
				>
					{t("models.huggingFace.search.empty", { base })}
				</Typography>
			) : (
				<Box sx={{ overflowX: "auto" }}>
					<Table aria-label={t("models.huggingFace.search.tableLabel")} sx={{ minWidth: 700 }}>
						<TableHead>
							<TableRow>
								<TableCell>{t("models.huggingFace.search.columns.repo")}</TableCell>
								<TableCell>{t("models.huggingFace.search.columns.kind")}</TableCell>
								<TableCell align="right">{t("models.huggingFace.search.columns.downloads")}</TableCell>
								<TableCell>{t("models.huggingFace.search.columns.compatibility")}</TableCell>
								<TableCell align="right">{t("models.huggingFace.search.columns.action")}</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{visibleRepos(repos, repositoryChecks, settings.compatibleOnly).map((repository) => (
								<TableRow
									hover
									key={`${repository.relation}:${repository.repoId}`}
									data-testid={`hf-${repository.repoId}`}
								>
									<TableCell>
										<Link
											href={`https://huggingface.co/${repository.repoId}`}
											rel="noreferrer"
											target="_blank"
											variant="subtitle2"
										>
											{repository.repoId}
										</Link>
									</TableCell>
									<TableCell>
										<Chip
											label={t(
												repository.relation === "adapter"
													? "models.huggingFace.kind.adapter"
													: "models.huggingFace.kind.fineTune"
											)}
											size="small"
										/>
									</TableCell>
									<TableCell align="right">{format.number(repository.downloads)}</TableCell>
									<TableCell data-testid="hf-verdict-cell">
										<VerdictCell check={repositoryChecks[repository.repoId]} />
									</TableCell>
									<TableCell align="right">
										<Button onClick={() => onCheck(repository.repoId)} size="small">
											{t("models.huggingFace.search.details")}
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
function visibleRepos(repos: HfRepository[], checks: Record<string, Check>, isCompatibleOnly: boolean): HfRepository[] {
	return isCompatibleOnly ? repos.filter((repository) => !isIncompatible(checks[repository.repoId])) : repos;
}

function CheckSummary({
	repos,
	checks,
	compatibleOnly,
}: {
	repos: HfRepository[];
	checks: Record<string, Check>;
	compatibleOnly: boolean;
}): React.JSX.Element {
	const { t } = useTranslation();
	const ids = [...new Set(repos.map((repository) => repository.repoId))];
	const finished = ids.filter((id) => checks[id]?.state === "done" || checks[id]?.state === "error").length;
	const count = (verdict: string): number =>
		ids.filter((id) => {
			const check = checks[id];
			return check?.state === "done" && check.result.verdict === verdict;
		}).length;
	const isChecking = ids.some((id) => checks[id]?.state === "checking");
	const hidden = repos.length - visibleRepos(repos, checks, compatibleOnly).length;
	const needsBase = count("needs-base-model");
	return (
		<Stack spacing={1} sx={{ px: 2, pb: 2 }}>
			<Typography
				data-testid="hf-check-summary"
				role="status"
				variant="body2"
				sx={{
					color: "text.secondary",
				}}
			>
				{t("models.huggingFace.search.summary.checked", {
					finished,
					total: ids.length,
					compatible: count("compatible"),
				})}
				{needsBase > 0 ? ` · ${t("models.huggingFace.search.summary.needBase", { count: needsBase })}` : ""}
				{hidden > 0 ? ` · ${t("models.huggingFace.search.summary.hidden", { count: hidden })}` : ""}
			</Typography>
			{isChecking ? (
				<LinearProgress
					aria-label={t("models.huggingFace.search.checkingCompatibility")}
					value={(finished / ids.length) * 100}
					variant="determinate"
				/>
			) : null}
		</Stack>
	);
}
