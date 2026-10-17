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
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import type { HfRepo, StoreModel } from "@/types/device";
import { responseError } from "@/lib/sse";

export interface CompatibleSearchProps {
	onCheck: (repoId: string) => void;
}

// Image-generation store models are the bases the device's importer can build on today.
const BASE_TYPES = new Set(["Text-to-Image"]);

export function CompatibleSearch({ onCheck }: CompatibleSearchProps): React.JSX.Element {
	const [bases, setBases] = React.useState<StoreModel[] | null>(null);
	const [base, setBase] = React.useState<string>("");
	const [query, setQuery] = React.useState<string>("");
	const [repos, setRepos] = React.useState<HfRepo[] | null>(null);
	const [searching, setSearching] = React.useState<boolean>(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		void (async () => {
			const response = await fetch("/api/store");
			if (!response.ok) {
				setError(await responseError(response));
				return;
			}
			const store = (await response.json()) as StoreModel[];
			const candidates = store.filter((model) => BASE_TYPES.has(model.type));
			setBases(candidates);
			setBase(
				(current) =>
					current || (candidates.find((model) => model.status !== "not_downloaded") ?? candidates[0])?.modelId || ""
			);
		})();
	}, []);

	const search = async (): Promise<void> => {
		setSearching(true);
		setError(null);
		try {
			const params = new URLSearchParams({ base, q: query });
			const response = await fetch(`/api/hf/search?${params.toString()}`);
			if (!response.ok) throw new Error(await responseError(response));
			setRepos((await response.json()) as HfRepo[]);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : String(error_));
		} finally {
			setSearching(false);
		}
	};

	return (
		<Card>
			<CardHeader
				subheader="LoRA adapters and fine-tunes on Hugging Face built on a store image model. Check one to see if the device can import it."
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
				<FormControl sx={{ minWidth: 300 }}>
					<InputLabel id="hf-base-label">Base model</InputLabel>
					<Select
						disabled={!bases}
						label="Base model"
						labelId="hf-base-label"
						onChange={(event) => setBase(event.target.value)}
						value={base}
					>
						{(bases ?? []).map((model) => (
							<MenuItem key={model.modelId} value={model.modelId}>
								{model.modelId}
								{model.status === "not_downloaded" ? "" : " (on device)"}
							</MenuItem>
						))}
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
			{searching ? <LinearProgress aria-label="Searching Hugging Face" /> : null}
			{error ? (
				<Alert severity="error" sx={{ m: 2 }}>
					{error}
				</Alert>
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
								<TableCell align="right">Action</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{repos.map((repo) => (
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
									<TableCell align="right">
										<Button onClick={() => onCheck(repo.repoId)} size="small">
											Check
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
