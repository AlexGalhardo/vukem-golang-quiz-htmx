// Applies the saved theme (or the OS preference) before first paint. Kept
// tiny and synchronous on purpose; app.ts owns the toggle.
(function () {
	var theme = null;
	try {
		var saved = JSON.parse(localStorage.getItem("quiz:v1") || "{}");
		theme = saved && saved.settings && saved.settings.theme;
	} catch (e) {
		theme = null;
	}
	if (theme !== "light" && theme !== "dark") {
		theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}
	document.documentElement.setAttribute("data-theme", theme);
})();
