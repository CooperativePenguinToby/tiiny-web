"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import createCache from "@emotion/cache";
import type { EmotionCache, Options as OptionsOfCreateCache } from "@emotion/cache";
import { CacheProvider as DefaultCacheProvider } from "@emotion/react";

// https://github.com/garronej/tss-react/blob/main/src/next/appDir.tsx

export type EmotionCacheProviderProperties = {
	/**
	This is the options passed to createCache() from 'import createCache from "@emotion/cache"'
	*/
	options: Omit<OptionsOfCreateCache, "insertionPoint"> & {
		prepend?: boolean;
	};
	/**
	By default <CacheProvider /> from 'import { CacheProvider } from "@emotion/react"'
	*/
	CacheProvider?: React.Provider<EmotionCache>;
	children: ReactNode;
};

export function EmotionCacheProvider(properties: EmotionCacheProviderProperties) {
	const { options: optionsWithPrepend, CacheProvider = DefaultCacheProvider, children } = properties;

	const { prepend = false, ...options } = optionsWithPrepend;

	const [{ cache, flush }] = React.useState(() => {
		const cache = createCache(options);
		cache.compat = true;
		const previousInsert = cache.insert;
		let inserted: { name: string; isGlobal: boolean }[] = [];
		cache.insert = (...arguments_) => {
			const [selector, serialized] = arguments_;
			if (cache.inserted[serialized.name] === undefined) {
				inserted.push({
					name: serialized.name,
					isGlobal: selector === "",
				});
			}
			return previousInsert(...arguments_);
		};
		const flush = () => {
			const previousInserted = inserted;
			inserted = [];
			return previousInserted;
		};
		return { cache, flush };
	});

	useServerInsertedHTML(() => {
		const inserted = flush();
		if (inserted.length === 0) {
			return null;
		}
		let styles = "";
		let dataEmotionAttribute = cache.key;

		const globals: {
			name: string;
			style: string;
		}[] = [];

		for (const { name, isGlobal } of inserted) {
			const style = cache.inserted[name];

			if (typeof style === "boolean") {
				continue;
			}

			if (isGlobal) {
				globals.push({ name, style: style! });
			} else {
				styles += style;
				dataEmotionAttribute += ` ${name}`;
			}
		}

		// eslint-disable-next-line unicorn/consistent-function-scoping
		const get__Html = (style: string) => (prepend ? `@layer emotion {${style}}` : style);

		return (
			<>
				{globals.map(({ name, style }) => (
					<style nonce={options.nonce} key={name} data-emotion={`${cache.key}-global ${name}`}>
						{get__Html(style)}
					</style>
				))}
				{styles !== "" && (
					<style nonce={options.nonce} data-emotion={dataEmotionAttribute}>
						{get__Html(styles)}
					</style>
				)}
			</>
		);
	});

	return <CacheProvider value={cache}>{children}</CacheProvider>;
}

export default EmotionCacheProvider;
