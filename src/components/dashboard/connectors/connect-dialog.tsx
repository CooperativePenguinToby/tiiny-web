"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { toDataURL } from "qrcode";

import type { Connector } from "@/types/device";
import { postJson } from "@/lib/api";

interface Field {
	name: string;
	label: string;
	type?: string;
	help?: string;
}

const FIELDS: Partial<Record<Connector["key"], { intro: string; fields: Field[] }>> = {
	telegram: {
		intro: "Create a bot with @BotFather in Telegram (/newbot) and paste the token it gives you.",
		fields: [{ name: "token", label: "Bot token", type: "password" }],
	},
	discord: {
		intro:
			"Create a bot in the Discord Developer Portal, turn on Message Content Intent, invite it to your server and paste its token.",
		fields: [
			{ name: "token", label: "Bot token", type: "password" },
			{ name: "channel", label: "Channel ID", help: "The channel the bot may read and post in." },
		],
	},
	x: {
		intro: "Sign in to x.com in a browser and copy the auth_token and ct0 cookies.",
		fields: [
			{ name: "authToken", label: "auth_token", type: "password" },
			{ name: "ct0", label: "ct0", type: "password" },
		],
	},
};

// Mail providers' server names (TiinyOS offers the same presets).
const MAIL_PRESETS = [
	{ name: "Gmail", imap: "imap.gmail.com", smtp: "smtp.gmail.com" },
	{ name: "Outlook / Microsoft 365", imap: "outlook.office365.com", smtp: "smtp.office365.com" },
	{ name: "iCloud", imap: "imap.mail.me.com", smtp: "smtp.mail.me.com" },
	{ name: "Yahoo", imap: "imap.mail.yahoo.com", smtp: "smtp.mail.yahoo.com" },
	{ name: "Other", imap: "", smtp: "" },
];

function QrCode({ text }: { text: string }): React.JSX.Element {
	const [image, setImage] = React.useState<string | null>(null);
	React.useEffect(() => {
		void toDataURL(text, { margin: 1, width: 240 }).then(setImage);
	}, [text]);
	return image ? (
		<Box
			alt="WhatsApp pairing QR code"
			component="img"
			data-testid="whatsapp-qr"
			src={image}
			sx={{ width: 240, height: 240 }}
		/>
	) : (
		<Box sx={{ width: 240, height: 240 }} />
	);
}

export interface ConnectDialogProperties {
	connector: Connector | null;
	onClose: () => void;
	onConnected: (message: string) => void;
}

// Collects credentials for a token, login or mail connector, or shows WhatsApp's QR code; the device
// checks them before anything is saved.
export function ConnectDialog({ connector, onClose, onConnected }: ConnectDialogProperties): React.JSX.Element {
	const [values, setValues] = React.useState<Record<string, string>>({});
	const [preset, setPreset] = React.useState(MAIL_PRESETS[0].name);
	const [qr, setQr] = React.useState<string | null>(null);
	const key = connector?.key;
	// WhatsApp asks the device for its QR code as soon as the dialog opens (below), so it starts busy.
	const [busy, setBusy] = React.useState(key === "whatsapp");
	const [error, setError] = React.useState<string | null>(null);

	// Settles in callbacks, so it can also run straight from the effect below.
	const send = (): void => {
		if (!key) return;
		const mail = MAIL_PRESETS.find((entry) => entry.name === preset)!;
		const body = key === "email" ? { key, imapHost: mail.imap, smtpHost: mail.smtp, ...values } : { key, ...values };
		void postJson<{ detail: string; qr?: string }>("/api/connectors/connect", body)
			.then((reply) => {
				if (reply.qr) setQr(reply.qr);
				else onConnected(`${connector.name} connected: ${reply.detail}.`);
			})
			.catch((error_: unknown) => setError(error_ instanceof Error ? error_.message : String(error_)))
			.finally(() => setBusy(false));
	};

	const submit = (): void => {
		if (!key) return;
		setBusy(true);
		setError(null);
		send();
	};

	// WhatsApp: show the device's QR code right away.
	const requestQr = React.useEffectEvent(send);
	React.useEffect(() => {
		if (key === "whatsapp") requestQr();
	}, [key]);

	const spec = key ? FIELDS[key] : undefined;
	const mail = MAIL_PRESETS.find((entry) => entry.name === preset)!;
	return (
		<Dialog fullWidth maxWidth="xs" onClose={onClose} open={connector !== null}>
			<DialogTitle>Connect {connector?.name}</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					{key === "whatsapp" ? (
						<>
							<DialogContentText>
								In WhatsApp on your phone open Settings → Linked devices → Link a device, and scan this code.
							</DialogContentText>
							<Stack sx={{ alignItems: "center" }}>{qr ? <QrCode text={qr} /> : null}</Stack>
						</>
					) : key === "email" ? (
						<>
							<DialogContentText>
								Use an app password (Gmail, Outlook and iCloud require one when two-step sign-in is on).
							</DialogContentText>
							<TextField
								label="Provider"
								onChange={(event) => setPreset(event.target.value)}
								select
								size="small"
								value={preset}
							>
								{MAIL_PRESETS.map((entry) => (
									<MenuItem key={entry.name} value={entry.name}>
										{entry.name}
									</MenuItem>
								))}
							</TextField>
							<TextField
								label="Email address"
								onChange={(event) => setValues({ ...values, username: event.target.value })}
								size="small"
								value={values.username ?? ""}
							/>
							<TextField
								label="App password"
								onChange={(event) => setValues({ ...values, password: event.target.value })}
								size="small"
								type="password"
								value={values.password ?? ""}
							/>
							{mail.name === "Other" ? (
								<>
									<TextField
										label="IMAP server"
										onChange={(event) => setValues({ ...values, imapHost: event.target.value })}
										size="small"
										value={values.imapHost ?? ""}
									/>
									<TextField
										label="SMTP server"
										onChange={(event) => setValues({ ...values, smtpHost: event.target.value })}
										size="small"
										value={values.smtpHost ?? ""}
									/>
								</>
							) : null}
						</>
					) : spec ? (
						<>
							<DialogContentText>{spec.intro}</DialogContentText>
							{spec.fields.map((field) => (
								<TextField
									helperText={field.help}
									key={field.name}
									label={field.label}
									onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
									size="small"
									type={field.type ?? "text"}
									value={values[field.name] ?? ""}
								/>
							))}
						</>
					) : null}
					{error ? <Alert severity="error">{error}</Alert> : null}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>{key === "whatsapp" ? "Close" : "Cancel"}</Button>
				{key === "whatsapp" ? (
					<Button disabled={busy} onClick={submit}>
						New code
					</Button>
				) : (
					<Button disabled={busy} onClick={submit} variant="contained">
						{busy ? "Checking…" : "Connect"}
					</Button>
				)}
			</DialogActions>
		</Dialog>
	);
}
