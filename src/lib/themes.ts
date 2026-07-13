// Theme definitions. Videos: royalty-free stock loops (Pexels/Coverr/Pixabay).
export type Theme = {
  id: string;
  name: string;
  poster: string; // preview image
  video?: string; // mp4 loop
  generated?: "dark-gradient" | "gold-particles";
};

export const THEMES: Theme[] = [
  {
    id: "rain-night",
    name: "Rain on Window",
    poster: "https://images.pexels.com/videos/2611250/free-video-2611250.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/2611250/2611250-uhd_2560_1440_30fps.mp4",
  },
  {
    id: "ocean",
    name: "Ocean Aerial",
    poster: "https://images.pexels.com/videos/1918465/free-video-1918465.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1918465/1918465-hd_1920_1080_30fps.mp4",
  },
  {
    id: "stars",
    name: "Night Sky",
    poster: "https://images.pexels.com/videos/857195/free-video-857195.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/857195/857195-hd_1920_1080_30fps.mp4",
  },
  {
    id: "clouds",
    name: "Cloud Timelapse",
    poster: "https://images.pexels.com/videos/3115693/free-video-3115693.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/3115693/3115693-hd_1920_1080_30fps.mp4",
  },
  {
    id: "forest",
    name: "Misty Forest",
    poster: "https://images.pexels.com/videos/1448735/free-video-1448735.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1448735/1448735-hd_1920_1080_25fps.mp4",
  },
  {
    id: "dunes",
    name: "Desert Dunes",
    poster: "https://images.pexels.com/videos/2098989/free-video-2098989.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/2098989/2098989-hd_1920_1080_30fps.mp4",
  },
  {
    id: "mosque",
    name: "Mosque at Maghrib",
    poster: "https://images.pexels.com/videos/8471985/pexels-photo-8471985.jpeg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/8471985/8471985-uhd_2560_1440_25fps.mp4",
  },
  {
    id: "kaaba",
    name: "Makkah Timelapse",
    poster: "https://images.pexels.com/videos/7249384/pexels-photo-7249384.jpeg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/7249384/7249384-hd_1920_1080_30fps.mp4",
  },
  {
    id: "snow",
    name: "Snowfall",
    poster: "https://images.pexels.com/videos/3373484/free-video-3373484.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/3373484/3373484-hd_1920_1080_25fps.mp4",
  },
  {
    id: "candle",
    name: "Candle Flame",
    poster: "https://images.pexels.com/videos/6466763/pexels-photo-6466763.jpeg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/6466763/6466763-hd_1920_1080_25fps.mp4",
  },
  {
    id: "waterfall",
    name: "Waterfall",
    poster: "https://images.pexels.com/videos/2098988/free-video-2098988.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/2098988/2098988-hd_1920_1080_30fps.mp4",
  },
  {
    id: "mountain",
    name: "Mountain Fog",
    poster: "https://images.pexels.com/videos/1526909/free-video-1526909.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1526909/1526909-hd_1920_1080_25fps.mp4",
  },
  {
    id: "sunset",
    name: "Golden Sunset",
    poster: "https://images.pexels.com/videos/1580507/free-video-1580507.jpg?auto=compress&w=640",
    video: "https://videos.pexels.com/video-files/1580507/1580507-hd_1920_1080_30fps.mp4",
  },
  {
    id: "dark-gradient",
    name: "Dark Emerald",
    poster: "",
    generated: "dark-gradient",
  },
  {
    id: "gold-particles",
    name: "Gold Particles",
    poster: "",
    generated: "gold-particles",
  },
];
