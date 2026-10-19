import type { NavItemConfig } from "@/types/nav";

export function isNavItemActive({
	disabled,
	external,
	href,
	matcher,
	pathname,
}: Pick<NavItemConfig, "disabled" | "external" | "href" | "matcher"> & { pathname: string }): boolean {
	if (disabled || !href || external) {
		return false;
	}

	if (matcher) {
		return matcher.type === "startsWith"
			? pathname.startsWith(matcher.href)
			: matcher.type === "equals" && pathname === matcher.href;
	}

	return pathname === href;
}
