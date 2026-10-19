import pluginReact from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import pluginNext from "@next/eslint-plugin-next";
import configPrettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import ts from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	js.configs.recommended,
	...ts.configs.recommended,
	{
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					ignoreRestSiblings: true,
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-empty-object-type": "off",
		},
	},
	configPrettier,
	importX.flatConfigs.recommended,
	importX.flatConfigs.typescript,
	{
		settings: {
			// Resolves the tsconfig "@/*" path alias as well as node_modules.
			"import-x/resolver-next": [createTypeScriptImportResolver()],
		},
	},
	pluginUnicorn.configs.recommended,
	{
		rules: {
			// Renamed from unicorn/prevent-abbreviations, which this project has always kept off.
			"unicorn/name-replacements": "off",
			"unicorn/no-null": "off",
			"unicorn/no-nested-ternary": "off",
			"unicorn/no-array-reduce": "off",
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		...pluginReact.configs["recommended-typescript"],
	},
	pluginReactHooks.configs.flat.recommended,
	pluginNext.configs.recommended,
];
