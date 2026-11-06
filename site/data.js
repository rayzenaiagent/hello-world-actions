/* RepoFA — curated data from recent public posts of t.me/RepoFA */
window.REPOFA = {
  channel: {
    handle: "RepoFA",
    title: "Persian GitHub",
    faTitle: "ریپوفا",
    subscribers: 15491,
    mission: "مرجع معرفی و حمایت از پروژه‌های کاربردی اوپن‌سورس برای توسعه‌دهندگان و کاربران.",
    links: {
      channel: "https://t.me/RepoFA",
      group: "https://t.me/RepoFaGP",
      x: "https://x.com/PersianGitHub",
      bot: "https://t.me/GitHubLensBot"
    }
  },
  categories: {
    ai:      { label: "هوش مصنوعی",        en: "AI & Agents",   color: "#D4A359" },
    cloud:   { label: "سرورلس و کلادفلر",  en: "Serverless",    color: "#E05A47" },
    science: { label: "علم و آموزش",        en: "Science / Edu", color: "#6FA287" },
    tools:   { label: "ابزار و بهره‌وری",    en: "Productivity",  color: "#B9B1A2" }
  },
  repos: [
    {
      id: "perfect-ai",
      name: "perfect-ai",
      owner: "realjustawall",
      order: 1,
      cat: "ai",
      tagline: "بیش از ۳۱۰۰ مهارت طراحی و فرانت‌اند برای Codex",
      summary: "مجموعه‌ای از دستورالعمل‌ها و الگوهای ساختاریافته که دستیار هوش مصنوعی را به یک متخصص طراحی رابط کاربری تبدیل می‌کند.",
      body: "این مخزن با گردآوری دستورالعمل‌ها و الگوهای منظم، کدکس را در پیاده‌سازی طرح‌های بصری سریع‌تر و دقیق‌تر می‌کند و کیفیت نهایی کد را بالا می‌برد. موشن، گرافیک سه‌بعدی و دسترس‌پذیری وب را پوشش می‌دهد و از تایپوگرافی فارسی هم پشتیبانی بومی دارد.",
      features: ["۳۱۰۰+ مهارت تخصصی", "موشن و گرافیک سه‌بعدی", "دسترس‌پذیری وب", "پشتیبانی بومی از تایپوگرافی فارسی"],
      tags: ["Codex", "Skills", "Frontend", "UI"],
      demo: null,
      reactions: { heart: 31, like: 3 },
      weights: [0.9, 0.0, 0.1, 0.6]
    },
    {
      id: "neo-ai-bot",
      name: "Neo-Ai-Bot",
      owner: "NeoTenet",
      order: 2,
      cat: "ai",
      tagline: "ربات هوش مصنوعی تلگرام، کاملاً سرورلس",
      summary: "ربات چندمنظوره تلگرام روی Cloudflare Workers که کلید API مدل‌های مختلف را بدون نیاز به سرور وصل می‌کند.",
      body: "Neo AI Bot روی زیرساخت Cloudflare Workers و یک دیتابیس ابری اجرا می‌شود و درخواست‌ها را در پس‌زمینه پایدار پردازش می‌کند. بینایی تصویر، ساخت و ویرایش عکس، کدنویسی و حافظه‌ی هوشمند گفتگو از طریق Upstash Redis از قابلیت‌های آن است.",
      features: ["معماری سرورلس روی Workers", "بینایی و ساخت/ویرایش تصویر", "کدنویسی", "حافظه گفتگو با Upstash Redis"],
      tags: ["Cloudflare", "Telegram", "Redis", "LLM"],
      demo: null,
      reactions: { fire: 35, heart: 9 },
      weights: [0.8, 0.9, 0.0, 0.3]
    },
    {
      id: "twp-cf",
      name: "TWP-CF",
      owner: "MHDLabs",
      order: 3,
      cat: "cloud",
      tagline: "پروکسی وب تلگرام روی Cloudflare Workers",
      summary: "ترافیک MTProto را از راه وب‌سوکت امن و Durable Objects مستقیم به سرورهای تلگرام می‌رساند؛ بدون سرور مجازی.",
      body: "TWP-CF یک پروکسی تحت وب برای تلگرام است که روی بستر ابری Cloudflare Workers اجرا می‌شود. ترافیک پروتکل MTProto از طریق وب‌سوکت امن و قابلیت Durable Objects مستقیماً به سرورهای تلگرام هدایت می‌شود تا بدون نیاز به VPS ارتباطی امن و پایدار برقرار شود.",
      features: ["اجرا روی Cloudflare Workers", "MTProto روی WebSocket امن", "Durable Objects", "بی‌نیاز از سرور مجازی"],
      tags: ["MTProto", "WebSocket", "Workers", "Proxy"],
      demo: null,
      reactions: { heart: 32, like: 6, fire: 1 },
      weights: [0.0, 1.0, 0.0, 0.4]
    },
    {
      id: "tree-of-neuron",
      name: "tree-of-neuron",
      owner: "fermow",
      order: 4,
      cat: "science",
      tagline: "درخت تعاملی تاریخ کشف نورون",
      summary: "۴۷ نقطه‌ی عطف تاریخ علوم اعصاب در قالب یک درخت پژوهشی تعاملی؛ از آناتومی باستان تا مدل‌های مدرن.",
      body: "این پروژه مسیر شناخت سیستم عصبی را با مصورسازی ۴۷ نقطه‌ی عطف تاریخی بازسازی می‌کند. کاربر می‌تواند ارتباط میان کشفیات، نظریه‌ها و شواهد آزمایشگاهی گوناگون را به‌صورت بصری مرور کند.",
      features: ["۴۷ نقطه عطف تاریخی", "درخت پژوهشی تعاملی", "اتصال نظریه‌ها و شواهد", "دموی آنلاین"],
      tags: ["Neuroscience", "DataViz", "Education"],
      demo: "https://fermow.github.io/tree-of-neuron",
      reactions: { heart: 37, like: 1 },
      weights: [0.1, 0.0, 1.0, 0.2]
    },
    {
      id: "smart-circuit-simulator",
      name: "smart-circuit-simulator",
      owner: "haedarfarhani",
      order: 5,
      cat: "science",
      tagline: "شبیه‌ساز بی‌درنگ مدار الکتریکی در مرورگر",
      summary: "ابزاری با React و TypeScript برای طراحی و تحلیل مدار، با تحلیل گره‌ای واقعی، بوم نامحدود و اسیلوسکوپ.",
      body: "Smart Circuit Simulator بدون نصب نرم‌افزار، طراحی و تحلیل مدار را در مرورگر ممکن می‌کند. محاسباتش بر پایه‌ی قوانین فیزیک و تحلیل گره‌ها است و رفتار المان‌ها را همراه با نمایش زنده‌ی جریان الکتریکی شبیه‌سازی می‌کند. بوم نامحدود و اسیلوسکوپ حرفه‌ای هم دارد.",
      features: ["تحلیل گره‌ای (Nodal Analysis)", "نمایش زنده جریان", "بوم نامحدود", "اسیلوسکوپ حرفه‌ای"],
      tags: ["React", "TypeScript", "Physics", "EE"],
      demo: "https://haedarfarhani.github.io/smart-circuit-simulator",
      reactions: { heart: 43, like: 5, fire: 2, other: 1 },
      weights: [0.0, 0.0, 0.9, 0.5]
    },
    {
      id: "twindesk",
      name: "TwinDesk",
      owner: "inukaasith",
      order: 6,
      cat: "tools",
      tagline: "چند دستگاه، یک سیستم واحد",
      summary: "لپ‌تاپ، کامپیوتر و گوشی را به هم وصل می‌کند تا موس، کیبورد، فایل و کلیپ‌بورد بینشان مشترک شود.",
      body: "اگر هم‌زمان با چند دستگاه کار می‌کنی، TwinDesk همه را مثل یک سیستم واحد کنار هم قرار می‌دهد: موس و کیبورد مشترک، جابه‌جایی فایل و کلیپ‌بورد یکپارچه بین لپ‌تاپ، کامپیوتر و گوشی.",
      features: ["موس و کیبورد مشترک", "انتقال فایل", "کلیپ‌بورد یکپارچه", "مناسب کار چنددستگاهی"],
      tags: ["Multi-device", "Clipboard", "Desktop"],
      demo: null,
      reactions: { heart: 62, like: 10, dislike: 3 },
      weights: [0.0, 0.1, 0.0, 1.0]
    },
    {
      id: "flomorphic",
      name: "FloMorphic",
      owner: "FloMorphic",
      repoPath: "FloMorphic/getting-started",
      order: 7,
      cat: "ai",
      tagline: "ساخت ایجنت روی زیرساخت خودت",
      summary: "پلتفرم کم‌کد برای ساخت ایجنت‌ها و سیستم‌های هوش مصنوعی، بدون فرستادن داده به سرویس‌های ابری.",
      body: "فلومورفیک فرایندها را در قالب یک گراف اجرایی با کانتکست مشترک سامان می‌دهد تا رفتار مدل‌ها قابل رهگیری و ممیزی باشد. بدون بازنویسی با سیستم‌های فعلی یکپارچه می‌شود و از لپ‌تاپ تا کلاستر توزیع‌شده قابل استقرار است.",
      features: ["پشتیبانی بومی از MCP", "ابزارهای RAG و حافظه پایدار", "هماهنگی چندایجنتی", "نظارت انسانی (HITL)"],
      tags: ["Agents", "MCP", "RAG", "Low-code"],
      demo: null,
      reactions: null,
      weights: [1.0, 0.3, 0.0, 0.4]
    }
  ]
};

(function () {
  var reps = window.REPOFA.repos;
  reps.forEach(function (r) {
    r.path = r.repoPath || (r.owner + "/" + r.name);
    r.url = "https://github.com/" + r.path;
    var t = 0;
    if (r.reactions) { for (var k in r.reactions) { t += r.reactions[k]; } }
    r.totalReactions = t;
  });
})();
