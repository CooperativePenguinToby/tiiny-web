"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { EyeIcon } from "@phosphor-icons/react/dist/ssr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/ssr/EyeSlash";
import type { TFunction } from "i18next";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z as zod } from "zod";

import { paths } from "@/paths";

const createSchema = (t: TFunction) =>
	zod.object({ password: zod.string().min(1, { error: t("auth.signIn.passwordRequired") }) });

type Values = zod.infer<ReturnType<typeof createSchema>>;

export function SignInForm(): React.JSX.Element {
	const { t } = useTranslation();
	const router = useRouter();
	const [showPassword, setShowPassword] = React.useState<boolean>(false);
	const [isPending, setIsPending] = React.useState<boolean>(false);
	const schema = React.useMemo(() => createSchema(t), [t]);

	const {
		control,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<Values>({ defaultValues: { password: "" }, resolver: zodResolver(schema) });

	const onSubmit = React.useCallback(
		async (values: Values): Promise<void> => {
			setIsPending(true);
			try {
				const response = await fetch("/api/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(values),
				});
				if (!response.ok) {
					let failure: { error?: string } = {};
					try {
						failure = (await response.json()) as { error?: string };
					} catch {
						// A missing or malformed body is handled like an empty one.
					}
					const { error } = failure;
					setError("root", { type: "server", message: error ?? t("auth.signIn.failed", { status: response.status }) });
					setIsPending(false);
					return;
				}
				router.replace(paths.dashboard.overview);
			} catch {
				setError("root", { type: "server", message: t("auth.signIn.unreachable") });
				setIsPending(false);
			}
		},
		[router, setError, t]
	);

	return (
		<Stack spacing={4}>
			<Stack spacing={1}>
				<Typography variant="h4">{t("auth.signIn.title")}</Typography>
				<Typography
					variant="body2"
					sx={{
						color: "text.secondary",
					}}
				>
					{t("auth.signIn.description")}
				</Typography>
			</Stack>
			<form onSubmit={handleSubmit(onSubmit)}>
				<Stack spacing={2}>
					<Controller
						control={control}
						name="password"
						render={({ field }) => (
							<FormControl error={Boolean(errors.password)}>
								<InputLabel htmlFor="password">{t("auth.signIn.password")}</InputLabel>
								<OutlinedInput
									{...field}
									autoComplete="current-password"
									autoFocus
									endAdornment={
										<InputAdornment position="end">
											<IconButton
												aria-label={t(showPassword ? "auth.signIn.hidePassword" : "auth.signIn.showPassword")}
												edge="end"
												onClick={(): void => {
													setShowPassword((value) => !value);
												}}
											>
												{showPassword ? (
													<EyeIcon fontSize="var(--icon-fontSize-md)" />
												) : (
													<EyeSlashIcon fontSize="var(--icon-fontSize-md)" />
												)}
											</IconButton>
										</InputAdornment>
									}
									id="password"
									label={t("auth.signIn.password")}
									type={showPassword ? "text" : "password"}
								/>
								{errors.password ? <FormHelperText>{errors.password.message}</FormHelperText> : null}
							</FormControl>
						)}
					/>
					{errors.root ? <Alert color="error">{errors.root.message}</Alert> : null}
					<Button disabled={isPending} type="submit" variant="contained">
						{t(isPending ? "auth.signIn.submitting" : "auth.signIn.submit")}
					</Button>
				</Stack>
			</form>
		</Stack>
	);
}
