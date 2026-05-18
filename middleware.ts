const BOT_UA =
  /bot|crawl|spider|slurp|archiver|wget|curl\/|python-requests|scrapy|httpclient|go-http|java\/|libwww|perl|ruby|php\/|ahrefsbot|semrushbot|mj12bot|dotbot|baiduspider|yandexbot|sogou|bytespider|petalbot|gptbot|claudebot|ccbot/i;

const SOCIAL_PREVIEW_UA =
  /twitterbot|facebookexternalhit|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|redditbot/i;

const SOCIAL_PREVIEW_PATHS = new Set(['/api/story', '/api/og-story']);

const PUBLIC_API_PATHS = new Set([
  '/api/version',
  '/api/health',
  '/api/seed-contract-probe',
  '/api/internal/brief-why-matters',
]);

const SOCIAL_IMAGE_UA =
  /Slack-ImgProxy|Slackbot|twitterbot|facebookexternalhit|linkedinbot|telegrambot|whatsapp|discordbot|redditbot/i;

const BRIEF_CAROUSEL_PATH_RE =
  /^\/api\/brief\/carousel\/[^/]+\/\d{4}-\d{2}-\d{2}-\d{4}\/[0-2]\/?$/;

// Safely grab the environment variable across Edge/Node environments
const globalEnv = (globalThis as any).process?.env;
const ROOT_DOMAIN = globalEnv?.VITE_ROOT_DOMAIN || 'worldmonitor.app';

// Dynamically generate the variant host map using your custom domain
const VARIANT_HOST_MAP: Record<string, string> = {
  [`tech.${ROOT_DOMAIN}`]: 'tech',
  [`finance.${ROOT_DOMAIN}`]: 'finance',
  [`commodity.${ROOT_DOMAIN}`]: 'commodity',
  [`happy.${ROOT_DOMAIN}`]: 'happy',
  [`energy.${ROOT_DOMAIN}`]: 'energy',
};

// Dynamically generate the Open Graph social preview URLs using your custom domain
const VARIANT_OG: Record<string, { title: string; description: string; image: string; url: string }> = {
  tech: {
    title: 'Tech Monitor - Real-Time AI & Tech Industry Dashboard',
    description: 'Real-time AI and tech industry dashboard tracking tech giants, AI labs, startup ecosystems, funding rounds, and tech events worldwide.',
    image: `https://tech.${ROOT_DOMAIN}/favico/tech/og-image.png`,
    url: `https://tech.${ROOT_DOMAIN}/`,
  },
  finance: {
    title: 'Finance Monitor - Real-Time Markets & Trading Dashboard',
    description: 'Real-time finance and trading dashboard tracking global markets, stock exchanges, central banks, commodities, forex, crypto, and economic indicators worldwide.',
    image: `https://finance.${ROOT_DOMAIN}/favico/finance/og-image.png`,
    url: `https://finance.${ROOT_DOMAIN}/`,
  },
  commodity: {
    title: 'Commodity Monitor - Real-Time Commodity Markets & Supply Chain Dashboard',
    description: 'Real-time commodity markets dashboard tracking mining sites, processing plants, commodity ports, supply chains, and global commodity trade flows.',
    image: `https://commodity.${ROOT_DOMAIN}/favico/commodity/og-image.png`,
    url: `https://commodity.${ROOT_DOMAIN}/`,
  },
  happy: {
    title: 'Happy Monitor - Good News & Global Progress',
    description: 'Curated positive news, progress data, and uplifting stories from around the world.',
    image: `https://happy.${ROOT_DOMAIN}/favico/happy/og-image.png`,
    url: `https://happy.${ROOT_DOMAIN}/`,
  },
  energy: {
    title: 'Energy Atlas - Real-Time Global Energy Intelligence Dashboard',
    description: 'Real-time global energy atlas tracking oil and gas pipelines, storage facilities, chokepoints, fuel shortages, tanker flows, and disruption events worldwide.',
    image: `https://energy.${ROOT_DOMAIN}/favico/energy/og-image.png`,
    url: `https://energy.${ROOT_DOMAIN}/`,
  },
};

const ALLOWED_HOSTS = new Set([
  ROOT_DOMAIN,
  ...Object.keys(VARIANT_HOST_MAP),
]);
const VERCEL_PREVIEW_RE = /^[a-z0-9-]+-[a-z0-9]{8,}\.vercel\.app$/;

function normalizeHost(raw: string): string {
  return raw.toLowerCase().replace(/:\d+$/, '');
}

function isAllowedHost(host: string): boolean {
  return ALLOWED_HOSTS.has(host) || VERCEL_PREVIEW_RE.test(host);
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') ?? '';
  const path = url.pathname;
  const host = normalizeHost(request.headers.get('host') ?? url.hostname);

  // Social bot OG response for variant subdomain root pages
  if (path === '/' && SOCIAL_PREVIEW_UA.test(ua)) {
    const variant = VARIANT_HOST_MAP[host];
    if (variant && isAllowedHost(host)) {
      const og = VARIANT_OG[variant as keyof typeof VARIANT_OG];
      if (og) {
        const html = `<!DOCTYPE html><html><head>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${og.title}"/>
<meta property="og:description" content="${og.description}"/>
<meta property="og:image" content="${og.image}"/>
<meta property="og:url" content="${og.url}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${og.title}"/>
<meta name="twitter:description" content="${og.description}"/>
<meta name="twitter:image" content="${og.image}"/>
<title>${og.title}</title>
</head><body></body></html>`;
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Vary': 'User-Agent, Host',
          },
        });
      }
    }
  }

  // Only apply bot filtering to /api/* and /favico/* paths
  if (!path.startsWith('/api/') && !path.startsWith('/favico/')) {
    return;
  }

  if (
    path.startsWith('/favico/') ||
    path.endsWith('.png') ||
    BRIEF_CAROUSEL_PATH_RE.test(path)
  ) {
    if (SOCIAL_IMAGE_UA.test(ua)) {
      return;
    }
  }

  // Allow social preview bots on exact OG routes only
  if (SOCIAL_PREVIEW_UA.test(ua) && SOCIAL_PREVIEW_PATHS.has(path)) {
    return;
  }

  // Public endpoints bypass all bot filtering
  if (PUBLIC_API_PATHS.has(path)) {
    return;
  }

  const WM_KEY_SHAPE = /^wm_[a-f0-9]{40}$/;
  const apiKey =
    request.headers.get('x-worldmonitor-key') ??
    request.headers.get('x-api-key') ??
    '';
  if (WM_KEY_SHAPE.test(apiKey)) {
    return;
  }

  // Block bots from all API routes
  if (BOT_UA.test(ua)) {
    return new Response('{"error":"Forbidden"}', {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // No user-agent or suspiciously short — likely a script
  if (!ua || ua.length < 10) {
    return new Response('{"error":"Forbidden"}', {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const config = {
  matcher: ['/', '/api/:path*', '/favico/:path*'],
};