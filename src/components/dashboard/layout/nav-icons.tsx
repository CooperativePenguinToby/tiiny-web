import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { ChartPieIcon } from "@phosphor-icons/react/dist/ssr/ChartPie";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { CpuIcon } from "@phosphor-icons/react/dist/ssr/Cpu";

export const navIcons = {
	"chart-pie": ChartPieIcon,
	"chat-circle-text": ChatCircleTextIcon,
	cpu: CpuIcon,
} as Record<string, Icon>;
