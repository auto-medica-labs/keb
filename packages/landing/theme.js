const themeToggle = document.getElementById("themeToggle");
const body = document.body;

const currentTheme = localStorage.getItem("theme") || "light";
if (currentTheme === "dark") {
  body.classList.add("dark-mode");
}

function applyIcons() {
  const isDark = body.classList.contains("dark-mode");
  themeToggle.innerHTML = isDark ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
  lucide.createIcons();
}

// Wait for full DOM — theme.js runs after <nav> but before <main> and <footer>
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyIcons);
} else {
  applyIcons();
}

themeToggle.addEventListener("click", () => {
  body.classList.toggle("dark-mode");
  const isDark = body.classList.contains("dark-mode");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  themeToggle.innerHTML = isDark ? '<i data-lucide="moon"></i>' : '<i data-lucide="sun"></i>';
  lucide.createIcons();
});
