"use client";

import * as React from "react";
import useEnhancedEffect from "@mui/utils/useEnhancedEffect";

export interface NoSsrProperties {
	children?: React.ReactNode;
	defer?: boolean;
	fallback?: React.ReactNode;
}

// https://github.com/mui/material-ui/blob/master/packages/mui-base/src/NoSsr/NoSsr.tsx
// without prop-types
export function NoSsr(properties: NoSsrProperties): React.JSX.Element {
	const { children, defer = false, fallback = null } = properties;
	const [mountedState, setMountedState] = React.useState(false);

	useEnhancedEffect((): void => {
		if (!defer) {
			// eslint-disable-next-line @eslint-react/set-state-in-effect -- the post-mount re-render is this component's purpose (as in MUI's NoSsr): fallback on the server and first client render, children from the (layout) effect on
			setMountedState(true);
		}
	}, [defer]);

	React.useEffect((): void => {
		if (defer) {
			// eslint-disable-next-line react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect -- the post-mount re-render is this component's purpose (as in MUI's NoSsr): fallback on the server and first client render, children from the (layout) effect on
			setMountedState(true);
		}
	}, [defer]);

	return <React.Fragment>{mountedState ? children : fallback}</React.Fragment>;
}
