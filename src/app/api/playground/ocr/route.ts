import { NextResponse } from "next/server";
import { DeviceError, deviceJson } from "@/server/device";
import { withModel } from "@/server/models";
import { modelIdOf } from "@/server/playground";
import { apiRoute } from "@/server/route";

interface OcrReply {
	data: { lines?: { text: string; score: number }[] }[];
}

// Multipart: model, file (image). Returns { text, lines: [{ text, score }] }.
export const POST = apiRoute(async (request) => {
	const form = await request.formData().catch(() => null);
	const model = modelIdOf(form?.get("model"));
	const file = form?.get("file");
	if (!(file instanceof File) || !file.type.startsWith("image/")) throw new DeviceError("Choose an image", 400);
	if (file.size > 20 * 1024 * 1024) throw new DeviceError("Image is larger than 20 MB", 400);
	const input = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
	const reply = await withModel(model, () =>
		deviceJson<OcrReply>(`/v1/ocr?model=${encodeURIComponent(model)}`, {
			method: "POST",
			body: { input, response_format: "json" },
			slow: true,
		})
	);
	const lines = reply.data.flatMap((item) => item.lines ?? []).map((line) => ({ text: line.text, score: line.score }));
	return NextResponse.json({ text: lines.map((line) => line.text).join("\n"), lines });
});
