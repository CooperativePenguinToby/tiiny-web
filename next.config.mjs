/**
@type {import('next').NextConfig}
*/
const config = {
	// The Docker image ships only the traced files in .next/standalone (see Dockerfile).
	output: "standalone",
};

export default config;
