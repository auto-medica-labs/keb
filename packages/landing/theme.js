const themeToggle = document.getElementById("themeToggle");
const body = document.body;

const currentTheme = localStorage.getItem("theme") || "light";
if (currentTheme === "dark") {
  body.classList.add("dark-mode");
  themeToggle.innerHTML = '<i data-lucide="moon"></i>';
} else {
  themeToggle.innerHTML = '<i data-lucide="sun"></i>';
}
lucide.createIcons();

themeToggle.addEventListener("click", () => {
  body.classList.toggle("dark-mode");
  if (body.classList.contains("dark-mode")) {
    themeToggle.innerHTML = '<i data-lucide="moon"></i>';
    localStorage.setItem("theme", "dark");
  } else {
    themeToggle.innerHTML = '<i data-lucide="sun"></i>';
    localStorage.setItem("theme", "light");
  }
  lucide.createIcons();
});
