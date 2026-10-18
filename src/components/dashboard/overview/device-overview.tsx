"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CpuIcon } from "@phosphor-icons/react/dist/ssr/Cpu";
import { GaugeIcon } from "@phosphor-icons/react/dist/ssr/Gauge";
import { HardDrivesIcon } from "@phosphor-icons/react/dist/ssr/HardDrives";
import { MemoryIcon } from "@phosphor-icons/react/dist/ssr/Memory";

import type { DeviceStatus } from "@/types/device";
import { formatBytes, percent } from "@/lib/format";
import { usePolling } from "@/hooks/use-polling";

import { RunningModels } from "./running-models";
import { StatCard } from "./stat-card";
import { TokenUsage } from "./token-usage";

export function DeviceOverview(): React.JSX.Element {
	const { data, error, isLoading, refresh } = usePolling<DeviceStatus>("/api/device", 5000);

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label="Loading device status" />
			</Stack>
		);
	}

	const errorAlert = error ? (
		<Alert
			action={
				<Button color="inherit" onClick={() => void refresh()} size="small">
					Retry
				</Button>
			}
			severity={data ? "warning" : "error"}
		>
			{data ? `Showing last known values. ${error}` : error}
		</Alert>
	) : null;

	if (!data) return <Stack spacing={3}>{errorAlert}</Stack>;

	const { npu, memory, disk } = data;

	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">Overview</Typography>
				<Typography color="text.secondary" variant="body2">
					{data.device.model} · TiinyOS {data.device.os} · {npu.statusMessage}
				</Typography>
			</div>
			{errorAlert}
			<Grid container spacing={3}>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						caption={`${npu.allocatedPercent}% reserved by loaded models`}
						color="var(--mui-palette-primary-main)"
						icon={GaugeIcon}
						percent={npu.utilizationPercent}
						title="NPU utilization"
						value={`${npu.utilizationPercent.toFixed(0)}%`}
					/>
				</Grid>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						caption={`${formatBytes(npu.memoryUsedBytes)} of ${formatBytes(npu.memoryTotalBytes)}`}
						color="var(--mui-palette-success-main)"
						icon={MemoryIcon}
						percent={percent(npu.memoryUsedBytes, npu.memoryTotalBytes)}
						title="NPU memory"
						value={`${percent(npu.memoryUsedBytes, npu.memoryTotalBytes).toFixed(0)}%`}
					/>
				</Grid>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						caption={`CPU ${data.cpuPercent.toFixed(0)}% · ${formatBytes(memory.usedBytes)} of ${formatBytes(memory.totalBytes)} RAM`}
						color="var(--mui-palette-warning-main)"
						icon={CpuIcon}
						percent={percent(memory.usedBytes, memory.totalBytes)}
						title="System memory"
						value={`${percent(memory.usedBytes, memory.totalBytes).toFixed(0)}%`}
					/>
				</Grid>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						caption={`${formatBytes(disk.usedBytes)} of ${formatBytes(disk.totalBytes)}`}
						color="var(--mui-palette-info-main)"
						icon={HardDrivesIcon}
						percent={percent(disk.usedBytes, disk.totalBytes)}
						title="Storage"
						value={`${percent(disk.usedBytes, disk.totalBytes).toFixed(0)}%`}
					/>
				</Grid>
			</Grid>
			<RunningModels models={data.running} />
			<TokenUsage />
		</Stack>
	);
}
