import type { Components } from "@mui/material/styles";

import type { Theme } from "../types";

export const MuiCardHeader = {
	defaultProps: { slotProps: { title: { variant: "h6" }, subheader: { variant: "body2" } } },
	styleOverrides: { root: { padding: "32px 24px 16px" } },
} satisfies Components<Theme>["MuiCardHeader"];
