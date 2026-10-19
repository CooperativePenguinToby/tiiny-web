import * as React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasSession } from "@/server/session";

import { config } from "@/config";
import { paths } from "@/paths";
import { getT } from "@/i18n/server";
import { Layout } from "@/components/auth/layout";
import { SignInForm } from "@/components/auth/sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getT();
	return { title: t("titles.page", { page: t("titles.signIn"), site: config.site.name }) };
}

export const dynamic = "force-dynamic";

export default async function Page(): Promise<React.JSX.Element> {
	if (await hasSession()) redirect(paths.dashboard.overview);

	return (
		<Layout>
			<SignInForm />
		</Layout>
	);
}
