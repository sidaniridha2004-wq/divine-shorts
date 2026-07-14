// Theme definitions. Videos: royalty-free stock loops (Pexels).
// Generated themes are rendered directly on the canvas so they always work,
// even offline or if a CDN link breaks.
export type GeneratedTheme =
  | { type: "solid"; color: string }
  | { type: "gradient"; from: string; to: string }
  | { type: "particles"; color: string; bg: string; size?: number }
  | { type: "bokeh"; color: string; bg: string }
  | { type: "pattern"; fg: string; bg: string };

export type ThemeCategory = "nature" | "sky" | "islamic" | "abstract" | "minimal";

export type Theme = {
  id: string;
  name: string;
  category: ThemeCategory;
  poster: string; // preview image ("" for generated themes)
  video?: string; // mp4 loop
  generated?: GeneratedTheme;
};

export const THEME_CATEGORIES: { id: ThemeCategory; name: string }[] = [
  { id: "nature", name: "Nature" },
  { id: "sky", name: "Sky" },
  { id: "islamic", name: "Islamic" },
  { id: "abstract", name: "Abstract" },
  { id: "minimal", name: "Minimal" },
];

export const THEMES: Theme[] = [
  // ── Nature ──────────────────────────────────────────────────────────
  {
    id: "rain-night",
    name: "Rain on Window",
    category: "nature",
    poster: "https://images.pexels.com/videos/2611250/free-video-2611250.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/2611250/2611250-uhd_2560_1440_30fps.mp4",
    generated: { type: "gradient", from: "#0B1220", to: "#050810" },
  },
  {
    id: "ocean",
    name: "Ocean Aerial",
    category: "nature",
    poster: "https://images.pexels.com/videos/1918465/free-video-1918465.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1918465/1918465-hd_1920_1080_30fps.mp4",
    generated: { type: "gradient", from: "#0B3D5C", to: "#031525" },
  },
  {
    id: "forest",
    name: "Misty Forest",
    category: "nature",
    poster: "https://images.pexels.com/videos/1448735/free-video-1448735.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1448735/1448735-hd_1920_1080_25fps.mp4",
    generated: { type: "gradient", from: "#14311F", to: "#050B08" },
  },
  {
    id: "dunes",
    name: "Desert Dunes",
    category: "nature",
    poster: "https://images.pexels.com/videos/2098989/free-video-2098989.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/2098989/2098989-hd_1920_1080_30fps.mp4",
    generated: { type: "gradient", from: "#8A5A2B", to: "#2A180A" },
  },
  {
    id: "snow",
    name: "Snowfall",
    category: "nature",
    poster: "https://images.pexels.com/videos/3373484/free-video-3373484.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/3373484/3373484-hd_1920_1080_25fps.mp4",
    generated: { type: "gradient", from: "#2A3A55", to: "#0A121F" },
  },
  {
    id: "waterfall",
    name: "Waterfall",
    category: "nature",
    poster: "https://images.pexels.com/videos/2098988/free-video-2098988.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/2098988/2098988-hd_1920_1080_30fps.mp4",
    generated: { type: "gradient", from: "#124A4D", to: "#04141A" },
  },
  {
    id: "mountain",
    name: "Mountain Fog",
    category: "nature",
    poster: "https://images.pexels.com/videos/1526909/free-video-1526909.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1526909/1526909-hd_1920_1080_25fps.mp4",
    generated: { type: "gradient", from: "#2E3B4A", to: "#0A1015" },
  },
  // ── Sky ─────────────────────────────────────────────────────────────
  {
    id: "stars",
    name: "Night Sky",
    category: "sky",
    poster: "https://images.pexels.com/videos/857195/free-video-857195.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/857195/857195-hd_1920_1080_30fps.mp4",
    generated: { type: "particles", color: "#FFFFFF", bg: "#05070D" },
  },
  {
    id: "clouds",
    name: "Cloud Timelapse",
    category: "sky",
    poster: "https://images.pexels.com/videos/3115693/free-video-3115693.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/3115693/3115693-hd_1920_1080_30fps.mp4",
    generated: { type: "gradient", from: "#4A6785", to: "#111A26" },
  },
  {
    id: "sunset",
    name: "Golden Sunset",
    category: "sky",
    poster: "https://images.pexels.com/videos/1580507/free-video-1580507.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1580507/1580507-hd_1920_1080_30fps.mp4",
    generated: { type: "gradient", from: "#B8621B", to: "#2A0F05" },
  },
  { id: "midnight", name: "Midnight Blue", category: "sky", poster: "", generated: { type: "gradient", from: "#050B14", to: "#12263A" } },
  { id: "aurora", name: "Aurora", category: "sky", poster: "", generated: { type: "gradient", from: "#06251B", to: "#3B1D5E" } },
  { id: "moonlight", name: "Moonlight", category: "sky", poster: "", generated: { type: "gradient", from: "#0B1020", to: "#2B3A55" } },
  { id: "starfield", name: "Starfield", category: "sky", poster: "", generated: { type: "particles", color: "#FFFFFF", bg: "#05070D" } },
  // ── Islamic ─────────────────────────────────────────────────────────
  {
    id: "mosque",
    name: "Mosque at Maghrib",
    category: "islamic",
    poster: "https://images.pexels.com/videos/8471985/pexels-photo-8471985.jpeg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/8471985/8471985-uhd_2560_1440_25fps.mp4",
    generated: { type: "gradient", from: "#3A2405", to: "#0B0F0E" },
  },
  {
    id: "kaaba",
    name: "Makkah Timelapse",
    category: "islamic",
    poster: "https://images.pexels.com/videos/7249384/pexels-photo-7249384.jpeg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/7249384/7249384-hd_1920_1080_30fps.mp4",
    generated: { type: "gradient", from: "#1A1208", to: "#050403" },
  },
  { id: "geometric-gold", name: "Gold Geometry", category: "islamic", poster: "", generated: { type: "pattern", fg: "#C9A227", bg: "#0B0F0E" } },
  { id: "geometric-emerald", name: "Emerald Geometry", category: "islamic", poster: "", generated: { type: "pattern", fg: "#2E9E6B", bg: "#06100B" } },
  { id: "lantern-glow", name: "Lantern Glow", category: "islamic", poster: "", generated: { type: "gradient", from: "#3A2405", to: "#0B0F0E" } },
  // ── Abstract ────────────────────────────────────────────────────────
  {
    id: "candle",
    name: "Candle Flame",
    category: "abstract",
    poster: "https://images.pexels.com/videos/6466763/pexels-photo-6466763.jpeg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/6466763/6466763-hd_1920_1080_25fps.mp4",
    generated: { type: "gradient", from: "#4A2408", to: "#0B0704" },
  },
  { id: "gold-particles", name: "Gold Particles", category: "abstract", poster: "", generated: { type: "particles", color: "#C9A227", bg: "#0B0F0E" } },
  { id: "silver-particles", name: "Silver Dust", category: "abstract", poster: "", generated: { type: "particles", color: "#CBD5E1", bg: "#0B0B10" } },
  { id: "emerald-particles", name: "Emerald Sparks", category: "abstract", poster: "", generated: { type: "particles", color: "#34D399", bg: "#06100B" } },
  { id: "bokeh-gold", name: "Golden Bokeh", category: "abstract", poster: "", generated: { type: "bokeh", color: "#C9A227", bg: "#0B0F0E" } },
  { id: "bokeh-blue", name: "Blue Bokeh", category: "abstract", poster: "", generated: { type: "bokeh", color: "#60A5FA", bg: "#05070D" } },
  { id: "dark-gradient", name: "Dark Emerald", category: "abstract", poster: "", generated: { type: "gradient", from: "#0F5132", to: "#0B0F0E" } },
  { id: "royal-purple", name: "Royal Purple", category: "abstract", poster: "", generated: { type: "gradient", from: "#2E1065", to: "#0B0F0E" } },
  { id: "deep-ocean", name: "Deep Ocean", category: "abstract", poster: "", generated: { type: "gradient", from: "#082F49", to: "#020617" } },
  { id: "crimson-night", name: "Crimson Night", category: "abstract", poster: "", generated: { type: "gradient", from: "#450A0A", to: "#0B0F0E" } },
  { id: "smoke", name: "Smoke", category: "abstract", poster: "", generated: { type: "gradient", from: "#26262B", to: "#000000" } },
  // ── Minimal ─────────────────────────────────────────────────────────
  { id: "solid-black", name: "Pure Black", category: "minimal", poster: "", generated: { type: "solid", color: "#000000" } },
  { id: "solid-charcoal", name: "Charcoal", category: "minimal", poster: "", generated: { type: "solid", color: "#101214" } },
  { id: "solid-emerald", name: "Deep Emerald", category: "minimal", poster: "", generated: { type: "solid", color: "#0F5132" } },
  { id: "solid-navy", name: "Midnight Navy", category: "minimal", poster: "", generated: { type: "solid", color: "#0F1B2D" } },
  { id: "solid-burgundy", name: "Burgundy", category: "minimal", poster: "", generated: { type: "solid", color: "#2D0F14" } },
  { id: "pattern-subtle", name: "Subtle Pattern", category: "minimal", poster: "", generated: { type: "pattern", fg: "#F5F1E8", bg: "#101214" } },
];
