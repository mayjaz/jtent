import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { ink: "#090909", gold: "#c9a56a", cream: "#f1e8d9" }, fontFamily: { display: ["Georgia", "serif"] } } },
  plugins: []
};
export default config;
