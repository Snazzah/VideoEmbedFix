import { providers } from './providers';
import { Provider, ProviderResponse } from './types';
import { redirectDebug } from './util';
import { html } from 'common-tags';

const embedServiceUserAgents = [
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'TelegramBot (like TwitterBot)',
  'Mozilla/5.0 (compatible; January/1.0; +https://gitlab.insrt.uk/revolt/january)',
  'vidembedtest'
];

const disableCache = false;
const serviceName = 'VideoEmbedFix';
const repoURL = 'https://github.com/Snazzah/VideoEmbedFix';

// #1da0f2

async function handleRequest(event: FetchEvent): Promise<Response> {
  if (event.request.method !== 'GET') return new Response('Server only supports GET requests.', { status: 405 });

  const userAgent = event.request.headers.get('user-agent');
  const url = new URL(event.request.url);
  let finalURL = url.pathname.replace(/^\/+/, '');
  let debugMode = false;

  // Index
  if (url.pathname === '/') {
    if (userAgent && embedServiceUserAgents.includes(userAgent))
      return new Response(
        `<!DOCTYPE html>
          <html lang="en">
            <head>
              <title>${serviceName}</title>
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
              <meta content="#fc2929" data-react-helmet="true" name="theme-color" />
              <meta http-equiv="refresh" content="0; url=${repoURL}" />
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

  // oembed.json
  if (url.pathname === '/oembed.json') {
    const title = url.searchParams.get('t');
    const user = url.searchParams.get('u');
    const videoLink = url.searchParams.get('l');
    const service = url.searchParams.get('s');

    return new Response(
      JSON.stringify({
        type: 'video',
        version: '1.0',
        provider_name: `${service} (via VideoEmbedFix)`,
        provider_url: 'https://github.com/Snazzah/VideoEmbedFix',
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

  // Health check route
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
        const response = await provider.extract(match, destURL.toString(), event, debugMode);
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
  if (response.status !== 301 && response.status !== 302) {
    response.headers.append('Cache-Control', 's-maxage=300');
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

addEventListener('fetch', (event) => {
  return event.respondWith(handleRequest(event));
});
