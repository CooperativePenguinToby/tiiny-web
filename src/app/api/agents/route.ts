import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";
import { agentDomain } from "@/server/shared/agent-domain.mjs";

import type { Agent } from "@/types/device";

interface Platform {
	name: string;
	app_version?: string;
	app_size?: number;
	blob_url?: string;
	sha256sum?: string;
}
interface CatalogApp {
	app_id: string;
	app_name: string;
	app_desc?: string;
	icon?: string;
	default_model?: string[];
	coming_soon?: boolean;
	platforms: Platform[];
}
interface CloudApp {
	app_id: string;
	version: string;
	installed: boolean;
	installed_service_id: string | null;
}
interface Service {
	id: string;
	status: string;
	cloud_version: string | null;
	ports?: { host_port: number; protocol: string }[];
}

interface UpdateCheck {
	service_id: string;
	latest_version: string;
	update_available: boolean;
}
interface ResourceUsage {
	service_id: string;
	total_cpu_percent: number;
	total_memory_usage_bytes: number;
}

type ProxyStates = Map<number, { listening: boolean; error: string | null }>;

// Store web agents are named `wa-<cloud app id>`.
const cloudId = (appId: string): string => appId.replace(/^wa-/, "");

// An optional list: empty when the device cannot answer.
async function listOrEmpty<T>(list: Promise<T[]>): Promise<T[]> {
	try {
		return await list;
	} catch {
		return [];
	}
}

// The device's download status for a web agent, or null when it has none to report.
async function downloadStatus(appId: string): Promise<{ status: string; overall_progress: number } | null> {
	try {
		return await deviceJson<{ status: string; overall_progress: number }>(
			`/api/services/download/${encodeURIComponent(cloudId(appId))}/status`,
			{ service: "agents" }
		);
	} catch {
		return null;
	}
}

export const GET = apiRoute(async () => {
	const [catalog, cloud, services, updates, usage] = await Promise.all([
		deviceJson<{ app: CatalogApp[] }>("/api/services/apps/metadata"),
		deviceJson<CloudApp[]>("/api/services/cloud/apps"),
		deviceJson<Service[]>("/api/services"),
		// Both are extras: the list still loads if the device cannot answer them.
		listOrEmpty(deviceJson<UpdateCheck[]>("/api/services/updates/check", { service: "agents" })),
		listOrEmpty(deviceJson<ResourceUsage[]>("/api/services/resource-usage", { service: "agents" })),
	]);
	const updateById = new Map(updates.map((entry) => [entry.service_id, entry]));
	const usageById = new Map(usage.map((entry) => [entry.service_id, entry]));
	const proxies = (globalThis as { tiinyAgentProxies?: ProxyStates }).tiinyAgentProxies;
	const domain = agentDomain();
	const cloudById = new Map(cloud.map((app) => [app.app_id, app]));
	const serviceById = new Map(services.map((service) => [service.id, service]));

	// An install's progress, and whether it is paused, is only in the download status. A very early pause
	// can stop an install before the device lists the agent at all, so every web agent is asked.
	const webApps = catalog.app.filter(
		(app) => !app.coming_soon && app.platforms.some((platform) => platform.name === "web")
	);
	const installs = new Map(
		await Promise.all(
			webApps.map(async (app) => {
				const status = await downloadStatus(app.app_id);
				const active = status && (status.status === "running" || status.status === "paused");
				return [
					app.app_id,
					active
						? {
								state: status.status === "paused" ? ("paused" as const) : ("running" as const),
								percent: status.overall_progress,
							}
						: null,
				] as const;
			})
		)
	);

	const agents: Agent[] = await Promise.all(
		catalog.app
			.filter((app) => !app.coming_soon)
			.map(async (app): Promise<Agent> => {
				const web = app.platforms.some((platform) => platform.name === "web");
				const cloudApp = cloudById.get(cloudId(app.app_id));
				const service = serviceById.get(cloudApp?.installed_service_id ?? cloudId(app.app_id));
				const port = service?.ports?.find((entry) => entry.protocol === "tcp")?.host_port ?? null;
				return {
					appId: app.app_id,
					name: app.app_name,
					description: app.app_desc ?? "",
					iconUrl: app.icon ?? null,
					kind: web ? "web" : "desktop",
					recommendedModels: app.default_model ?? [],
					downloads: web
						? []
						: app.platforms
								.filter((platform) => platform.blob_url)
								.map((platform) => ({
									platform: platform.name,
									version: platform.app_version ?? "",
									sizeBytes: platform.app_size ?? 0,
									url: platform.blob_url!,
									sha256: platform.sha256sum ?? "",
								})),
					cloudVersion: cloudApp?.version ?? null,
					install: installs.get(app.app_id) ?? null,
					service: service
						? {
								id: service.id,
								status: service.status,
								version: service.cloud_version,
								port,
								proxy: port === null ? null : (proxies?.get(port) ?? null),
								subdomain: domain && port !== null ? `${service.id}.${domain}` : null,
								update: updateById.get(service.id)?.update_available
									? { latestVersion: updateById.get(service.id)!.latest_version }
									: null,
								usage: usageById.has(service.id)
									? {
											cpuPercent: usageById.get(service.id)!.total_cpu_percent,
											memoryBytes: usageById.get(service.id)!.total_memory_usage_bytes,
										}
									: null,
							}
						: null,
				};
			})
	);
	return NextResponse.json(agents);
});
