import * as React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasSession } from "@/server/session";

import { config } from "@/config";
import { paths } from "@/paths";
import { Layout } from "@/components/auth/layout";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata = { title: `Sign in | ${config.site.name}` } satisfies Metadata;

export const dynamic = "force-dynamic";

export default async function Page(): Promise<React.JSX.Element> {
	if (await hasSession()) redirect(paths.dashboard.overview);

	return (
		<Layout>
			<SignInForm />
		</Layout>
	);
}
