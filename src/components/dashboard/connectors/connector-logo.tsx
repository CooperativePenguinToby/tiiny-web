import * as React from "react";
import Box from "@mui/material/Box";
import { CalendarBlankIcon } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";

import type { ConnectorKey } from "@/types/device";

// The services' own logos (public/connectors). Outlook has no separate calendar logo, so Outlook Calendar is
// the Outlook logo with a calendar badge; plain IMAP/SMTP email has no brand, so it gets an envelope.
const LOGOS: Partial<Record<ConnectorKey, string>> = {
	gmail: "/connectors/gmail.svg",
	"google-calendar": "/connectors/google-calendar.svg",
	"outlook-mail": "/connectors/outlook.svg",
	"outlook-calendar": "/connectors/outlook.svg",
	telegram: "/connectors/telegram.svg",
	discord: "/connectors/discord.svg",
	x: "/connectors/x.svg",
	whatsapp: "/connectors/whatsapp.svg",
};
const SIZE = 32;

export function ConnectorLogo({ connectorKey }: { connectorKey: ConnectorKey }): React.JSX.Element {
	const source = LOGOS[connectorKey];
	if (!source) {
		return <EnvelopeSimpleIcon aria-hidden color="var(--mui-palette-text-secondary)" fontSize={SIZE} />;
	}
	return (
		<Box sx={{ position: "relative", flex: "0 0 auto", width: SIZE, height: SIZE }}>
			<Box alt="" component="img" src={source} sx={{ width: SIZE, height: SIZE, objectFit: "contain" }} />
			{connectorKey === "outlook-calendar" ? (
				<Box
					sx={{
						position: "absolute",
						right: -4,
						bottom: -4,
						display: "flex",
						p: "2px",
						borderRadius: "50%",
						bgcolor: "background.paper",
						boxShadow: 1,
					}}
				>
					<CalendarBlankIcon aria-hidden color="#0078D4" fontSize={12} weight="bold" />
				</Box>
			) : null}
		</Box>
	);
}
