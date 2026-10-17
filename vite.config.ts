import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

import vukem from "./resources/vite/vukem.js";

export default defineConfig({
	plugins: [
		tailwindcss(),
		vukem({ input: ["resources/css/app.css", "resources/js/app.ts"] }),
	],
	server: {
		// Listen on every interface so the Vite container is reachable from
		// the host; the vukem plugin still writes "localhost" to the hot file.
		host: true,
		port: 5173,
		strictPort: true,
	},
});
