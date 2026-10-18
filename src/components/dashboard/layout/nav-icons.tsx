import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { ChartPieIcon } from "@phosphor-icons/react/dist/ssr/ChartPie";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { CpuIcon } from "@phosphor-icons/react/dist/ssr/Cpu";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { GearSixIcon } from "@phosphor-icons/react/dist/ssr/GearSix";
import { PlugsConnectedIcon } from "@phosphor-icons/react/dist/ssr/PlugsConnected";
import { RobotIcon } from "@phosphor-icons/react/dist/ssr/Robot";
import { StorefrontIcon } from "@phosphor-icons/react/dist/ssr/Storefront";
import { VaultIcon } from "@phosphor-icons/react/dist/ssr/Vault";

export const navIcons = {
	"chart-pie": ChartPieIcon,
	"chat-circle-text": ChatCircleTextIcon,
	"clock-counter-clockwise": ClockCounterClockwiseIcon,
	cpu: CpuIcon,
	download: DownloadSimpleIcon,
	"gear-six": GearSixIcon,
	"plugs-connected": PlugsConnectedIcon,
	robot: RobotIcon,
	storefront: StorefrontIcon,
	vault: VaultIcon,
} as Record<string, Icon>;
