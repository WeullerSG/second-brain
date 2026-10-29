/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // O tema escuro segue o botão do app (classe "dark"), não o tema do celular
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
};
