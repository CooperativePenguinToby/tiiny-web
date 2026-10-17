import { NextResponse } from "next/server";
import { deviceJson } from "@/server/device";
import { apiRoute } from "@/server/route";

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
interface ServiceStatus {
	containers: { ports?: Record<string, { HostIp: string; HostPort: string }[]> }[];
}

type ProxyStates = Map<number, { listening: boolean; error: string | null }>;

// Store web agents are named `wa-<cloud app id>`.
const cloudId = (appId: string): string => appId.replace(/^wa-/, "");

async function loopbackOnly(serviceId: string, port: number): Promise<boolean> {
	const status = await deviceJson<ServiceStatus>(`/api/services/${encodeURIComponent(serviceId)}/status`);
	const bindings = status.containers.flatMap((container) => Object.values(container.ports ?? {}).flat());
	const binding = bindings.find((entry) => Number(entry.HostPort) === port);
	return binding ? binding.HostIp === "127.0.0.1" || binding.HostIp === "::1" : false;
}

export const GET = apiRoute(async () => {
	const [catalog, cloud, services] = await Promise.all([
		deviceJson<{ app: CatalogApp[] }>("/api/services/apps/metadata"),
		deviceJson<CloudApp[]>("/api/services/cloud/apps"),
		deviceJson<Service[]>("/api/services"),
	]);
	const proxies = (globalThis as { tiinyAgentProxies?: ProxyStates }).tiinyAgentProxies;
	const cloudById = new Map(cloud.map((app) => [app.app_id, app]));
	const serviceById = new Map(services.map((service) => [service.id, service]));

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
					service: service
						? {
								id: service.id,
								status: service.status,
								version: service.cloud_version,
								port,
								reachable: port === null ? false : !(await loopbackOnly(service.id, port)),
								proxy: port === null ? null : (proxies?.get(port) ?? null),
							}
						: null,
				};
			})
	);
	return NextResponse.json(agents);
});
