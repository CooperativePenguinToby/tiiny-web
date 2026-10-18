import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { ChartPieIcon } from "@phosphor-icons/react/dist/ssr/ChartPie";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { CpuIcon } from "@phosphor-icons/react/dist/ssr/Cpu";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { GearSixIcon } from "@phosphor-icons/react/dist/ssr/GearSix";
import { RobotIcon } from "@phosphor-icons/react/dist/ssr/Robot";
import { StorefrontIcon } from "@phosphor-icons/react/dist/ssr/Storefront";

export const navIcons = {
	"chart-pie": ChartPieIcon,
	"chat-circle-text": ChatCircleTextIcon,
	cpu: CpuIcon,
	download: DownloadSimpleIcon,
	"gear-six": GearSixIcon,
	robot: RobotIcon,
	storefront: StorefrontIcon,
} as Record<string, Icon>;
