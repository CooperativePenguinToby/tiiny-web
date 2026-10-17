// Response shapes of device endpoints read by more than one route (only the fields used).

export interface RunningInstance {
	model_id: string;
	display_name: string;
	type: string;
	status: string;
	npu_usage: number;
	active_request_count: number;
}

export interface RunningModels {
	instances: { running: RunningInstance[]; pending: RunningInstance[] };
}
