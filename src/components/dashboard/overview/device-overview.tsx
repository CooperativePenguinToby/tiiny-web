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
import { useTranslation } from "react-i18next";

import type { DeviceStatus } from "@/types/device";
import { percent } from "@/lib/format";
import { useFormat } from "@/i18n/client";
import { usePolling } from "@/hooks/use-polling";

import { RunningModels } from "./running-models";
import { StatCard } from "./stat-card";
import { TokenUsage } from "./token-usage";

export function DeviceOverview(): React.JSX.Element {
	const { t } = useTranslation();
	const format = useFormat();
	const { data, error, isLoading, refresh } = usePolling<DeviceStatus>("/api/device", 5000);

	if (isLoading) {
		return (
			<Stack sx={{ alignItems: "center", py: 8 }}>
				<CircularProgress aria-label={t("overview.loading")} />
			</Stack>
		);
	}

	const errorAlert = error ? (
		<Alert
			action={
				<Button color="inherit" onClick={() => void refresh()} size="small">
					{t("overview.retry")}
				</Button>
			}
			severity={data ? "warning" : "error"}
		>
			{data ? t("overview.staleValues", { error }) : error}
		</Alert>
	) : null;

	if (!data) return <Stack spacing={3}>{errorAlert}</Stack>;

	const { npu, memory, disk } = data;
	const percentText = (value: number): string =>
		t("overview.percent", { value: format.number(value, { maximumFractionDigits: 0 }) });
	const usedOfTotal = (used: number, total: number): string =>
		t("overview.usedOfTotal", { used: format.bytes(used), total: format.bytes(total) });

	return (
		<Stack spacing={3}>
			<div>
				<Typography variant="h4">{t("overview.title")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{data.device.model} · TiinyOS {data.device.os} ·{" "}
					{/* The device's own sentence is English; translate the states we know. */}
					{npu.status === "ready" ? t("overview.npuReady") : npu.statusMessage}
				</Typography>
			</div>
			{errorAlert}
			<Grid container spacing={3}>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						id="NPU utilization"
						caption={t("overview.stats.npuReserved", {
							percent: t("overview.percent", { value: format.number(npu.allocatedPercent) }),
						})}
						color="var(--mui-palette-primary-main)"
						icon={GaugeIcon}
						percent={npu.utilizationPercent}
						title={t("overview.stats.npuUtilization")}
						value={percentText(npu.utilizationPercent)}
					/>
				</Grid>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						id="NPU memory"
						caption={usedOfTotal(npu.memoryUsedBytes, npu.memoryTotalBytes)}
						color="var(--mui-palette-success-main)"
						icon={MemoryIcon}
						percent={percent(npu.memoryUsedBytes, npu.memoryTotalBytes)}
						title={t("overview.stats.npuMemory")}
						value={percentText(percent(npu.memoryUsedBytes, npu.memoryTotalBytes))}
					/>
				</Grid>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						id="System memory"
						caption={t("overview.stats.systemMemoryCaption", {
							cpu: percentText(data.cpuPercent),
							used: format.bytes(memory.usedBytes),
							total: format.bytes(memory.totalBytes),
						})}
						color="var(--mui-palette-warning-main)"
						icon={CpuIcon}
						percent={percent(memory.usedBytes, memory.totalBytes)}
						title={t("overview.stats.systemMemory")}
						value={percentText(percent(memory.usedBytes, memory.totalBytes))}
					/>
				</Grid>
				<Grid size={{ lg: 3, sm: 6, xs: 12 }}>
					<StatCard
						id="Storage"
						caption={usedOfTotal(disk.usedBytes, disk.totalBytes)}
						color="var(--mui-palette-info-main)"
						icon={HardDrivesIcon}
						percent={percent(disk.usedBytes, disk.totalBytes)}
						title={t("overview.stats.storage")}
						value={percentText(percent(disk.usedBytes, disk.totalBytes))}
					/>
				</Grid>
			</Grid>
			<RunningModels models={data.running} />
			<TokenUsage />
		</Stack>
	);
}
