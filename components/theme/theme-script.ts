import { THEME_STORAGE_KEY } from "@/lib/config/theme";

export const THEME_BOOTSTRAP = `(()=>{try{const p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});const d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch{}})();`;
