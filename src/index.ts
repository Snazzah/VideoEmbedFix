import { providers } from './providers';
import { Provider, ProviderResponse } from './types';
import { redirectDebug } from './util';
import { html } from 'common-tags';
import { getData as getTikTokData } from './providers/tiktok';
declare const VEF_CACHE: KVNamespace;

const embedServiceUserAgents = [
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'TelegramBot (like TwitterBot)',
  'Mozilla/5.0 (compatible; January/1.0; +https://gitlab.insrt.uk/revolt/january)',
  'vidembedtest'
];

const disableCache = false;
const serviceName = 'VideoEmbedFix';
const repoURL = 'https://github.com/Snazzah/VideoEmbedFix';

async function handleRequest(event: FetchEvent): Promise<Response> {
  if (event.request.method !== 'GET') return new Response('Server only supports GET requests.', { status: 405 });

  const userAgent = event.request.headers.get('user-agent');
  const url = new URL(event.request.url);
  let finalURL = url.pathname.replace(/^\/+/, '');
  let debugMode = false;

  if (url.pathname === '/') return indexRoute(event, userAgent);
  if (url.pathname === '/oembed.json') return oembedRoute(url);
  if (url.pathname === '/tiktokvideo') return tiktokVideoRoute(url);
  if (url.pathname.startsWith('/_tiktok')) return tiktokRoute(url);
  if (url.pathname === '/health')
    return new Response('OK', {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Expires: '0',
        'Surrogate-Control': 'no-store'
      }
    });

  // Debug toggle
  if (finalURL.startsWith('_d/')) {
    debugMode = true;
    finalURL = finalURL.slice(3);
  }

  // HTTP(S) fixing
  if (/^https?:\/\/?/.test(finalURL)) finalURL = finalURL.replace(/https?:\/\/?/, '');
  finalURL = 'https://' + finalURL;

  try {
    const destURL = new URL(finalURL);

    const provider = providers.get(destURL.hostname);
    if (!provider) return redirectDebug('Could not find a provider', finalURL, debugMode);

    if (userAgent && !embedServiceUserAgents.includes(userAgent)) {
      console.log(`Non-caching User Agent found: ${userAgent}`);
      return Response.redirect(destURL.toString(), 302);
    }

    return cacheResponse(destURL.toString(), async () => {
      const match = provider.regex.exec(destURL.toString());
      if (!match) return redirectDebug(`Failed to match URL (${provider.title}, ${finalURL})}`, finalURL, debugMode);

      try {
        const response = await provider.extract(match, destURL.toString(), event, debugMode, url);
        if (!response)
          return redirectDebug(`Provider gave a null response (${provider.title}, ${finalURL})}`, finalURL, debugMode);

        if (response instanceof Response) return response;

        console.log('embedding response', response);
        return embedResponse(event, response, provider);
      } catch (e) {
        return redirectDebug(
          `Provider threw an error (${provider.title}, ${finalURL}): ${(e as Error).toString()}`,
          finalURL,
          debugMode
        );
      }
    });
  } catch (e) {
    console.log(e);
    return redirectDebug(`Failed to extract (${finalURL}): ${(e as Error).toString()}`, finalURL, debugMode);
  }
}

function indexRoute(event: FetchEvent, userAgent: string | null): Response {
  const isTelegram = event.request.headers.get('User-Agent')?.includes('TelegramBot');

  if (userAgent && embedServiceUserAgents.includes(userAgent))
    return new Response(
      `<!DOCTYPE html>
        <html lang="en">
          <head>
            <title>${serviceName}</title>
            ${isTelegram ? `<meta property="og:site_name" content="${serviceName}" />` : ''}
            <meta content="${serviceName}" property="og:title" />
            <meta
              content="${[
                'VideoEmbedFix is a service that fixes embeds for various services in Discord and Telegram.',
                'Created by Snazzah (snazzah.com), inspired by TwitFix by robinuniverse.',
                '',
                'Click here to redirect to the GitHub repo!'
              ].join('\n')}"
              property="og:description"
            />
            <meta content="${repoURL}" property="og:url" />
            <meta content="https://get.snaz.in/${isTelegram ? '8rEHmgH' : '9BVtA8t'}.png" property="og:image">
            <meta content="#fc2929" data-react-helmet="true" name="theme-color" />
            ${isTelegram ? '' : `<meta http-equiv="refresh" content="0; url=${repoURL}" />`}
          </head>
          <body>
            Redirecting you to this service's Github Repository: <a href="${repoURL}">${repoURL}</a>
          </body>
        </html>`,
      {
        headers: {
          'content-type': 'text/html;charset=UTF-8'
        }
      }
    );
  else return Response.redirect(repoURL, 301);
}

function oembedRoute(url: URL): Response {
  const title = url.searchParams.get('t');
  const user = url.searchParams.get('u');
  const videoLink = url.searchParams.get('l');
  const service = url.searchParams.get('s');

  return new Response(
    JSON.stringify({
      type: 'video',
      version: '1.0',
      provider_name: `${service} (via ${serviceName})`,
      provider_url: repoURL,
      title,
      url: videoLink,
      author_name: user,
      author_url: videoLink
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

async function tiktokVideoRoute(url: URL): Promise<Response> {
  const videoLink = url.searchParams.get('l');
  if (!videoLink) return new Response('No video link provided', { status: 400 });

  const videoURL = new URL(videoLink);
  if (!videoURL.hostname.endsWith('.tiktok.com')) return new Response('Invalid host', { status: 400 });

  const response = await fetch(videoLink, {
    headers: {
      accept: '*/*',
      referer: videoLink
    },
    cf: {
      cacheTtl: 600,
      cacheEverything: true
    }
  });

  if (!response.ok) return new Response('Failed to fetch video', { status: response.status });

  return response;
}

async function tiktokRoute(url: URL): Promise<Response> {
  const [, , user, videoId] = url.pathname.split('/');
  if (!user || !videoId) return new Response('No user or video ID provided', { status: 400 });

  async function fetchVideo(videoLink: string): Promise<Response> {
    const response = await fetch(videoLink, {
      headers: {
        accept: '*/*',
        referer: videoLink
      },
      cf: { cacheTtl: 600 }
    });

    if (!response.ok) return new Response('Failed to fetch video', { status: response.status });

    await cache.put(cacheKey, response.clone());
    return response;
  }

  // Check if the video is cached
  const cache = await caches.open('tiktok');
  const cacheKey = new Request(`https://www.tiktok.com/@${user}/video/${videoId}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Check the KV store for the video
  const video = await VEF_CACHE.get(`tiktok:${user}:${videoId}`);
  if (video) return fetchVideo(video);

  // Fetch the video (probably will fail)
  const data = await getTikTokData(user, videoId);
  if (!data) return new Response('Body match failed', { status: 500 });
  if (data.props.pageProps.statusCode === 10216) return new Response('Video is private', { status: 400 });

  const videoLink = data.props.pageProps.itemInfo.itemStruct.video.playAddr;
  return fetchVideo(videoLink);
}

function embedResponse(event: FetchEvent, result: ProviderResponse, provider: Provider): Response {
  const isDiscord = event.request.headers.get('User-Agent')?.includes('Discordbot');
  const isTelegram = event.request.headers.get('User-Agent')?.includes('TelegramBot');

  const title = isTelegram ? result.telegramTitle || result.title : result.title;

  const oembed = `https://${new URL(event.request.url).hostname}/oembed.json?t=${encodeURIComponent(
    result.title
  )}&u=${encodeURIComponent(result.user || result.title)}&l=${encodeURIComponent(
    result.videoURL
  )}&s=${encodeURIComponent(provider.title)}`;
  return new Response(
    html`<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
          <meta content="${result.themeColor || '#fc2929'}" data-react-helmet="true" name="theme-color" />
          <meta property="og:site_name" content="${provider.title} (via VideoEmbedFix)" />

          <meta name="twitter:card" content="player" />
          <meta name="twitter:title" content="${title}" />
          <meta name="twitter:image" content="${result.thumbnail}" />
          <meta name="twitter:player:width" content="${result.width || 720}" />
          <meta name="twitter:player:height" content="${result.height || 480}" />
          <meta name="twitter:player:stream" content="${result.videoURL}" />
          <meta name="twitter:player:stream:content_type" content="${result.mediaType || 'video/mp4'}" />

          <meta property="og:url" content="${result.url}" />
          <meta property="og:video" content="${result.videoURL}" />
          <meta property="og:video:secure_url" content="${result.videoURL}" />
          <meta property="og:video:type" content="${result.mediaType || 'video/mp4'}" />
          <meta property="og:video:width" content="${result.width || 720}" />
          <meta property="og:video:height" content="${result.height || 480}" />
          <meta property="og:title" content="${title}" />
          ${isDiscord && result.description ? `<meta property="og:description" content="${result.description}" />` : ''}
          <meta property="og:image" content="${result.thumbnail}" />

          ${!isTelegram
            ? `
              <link rel="alternate" href="${oembed}" type="application/json+oembed" title="${title}" />
              <meta http-equiv="refresh" content="0; url=${result.url}" />
              `
            : ''}
        </head>
        <body>
          Redirecting you to the following ${provider.title} URL: <a href="${result.url}">${result.url}</a>
        </body>
      </html>`,
    {
      headers: {
        'content-type': 'text/html;charset=UTF-8'
      }
    }
  );
}

async function cacheResponse(url: string, fn: () => Promise<Response>): Promise<Response> {
  if (disableCache) return await fn();

  const cacheKey = new Request(url);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await fn();
  const cacheResponse = response.clone();
  try {
    cacheResponse.headers.set('cache-control', 'public, no-transform, max-age=86400');
  } catch (e) {}
  await cache.put(cacheKey, cacheResponse);
  return response;
}

addEventListener('fetch', (event) => {
  return event.respondWith(handleRequest(event));
});
