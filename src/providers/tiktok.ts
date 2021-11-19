import { Provider } from '../types';
import { fetchAndCache, makeid, redirectDebug, userAgent } from '../util';
declare const VEF_CACHE: KVNamespace;

export const title = 'TikTok';
export const domains = ['tiktok.com', 'www.tiktok.com'];
export const regex = /^https?:\/\/(?:www\.)?tiktok\.com\/@([^/]+)\/video\/(\d+)/;

export async function getData(user: string, videoId: string): Promise<any> {
  const [page, uncache] = await fetchAndCache(`https://www.tiktok.com/@${user}/video/${videoId}`, {
    headers: {
      'user-agent': userAgent(),
      referer: 'https://www.tiktok.com/',
      cookie: `tt_webid_v2=69${makeid(17)}`
    }
  });
  const body = await page.text();
  const bodyMatch = body.match(/<script[^>]+\bid=["']__NEXT_DATA__[^>]+>\s*({.+?})\s*<\/script/);
  if (!bodyMatch) {
    await uncache();
    return null;
  }

  return JSON.parse(bodyMatch[1]);
}

export async function cacheVideo(user: string, videoId: string, videoLink: string) {
  const cache = await caches.open('tiktok');
  const cacheKey = new Request(`https://www.tiktok.com/@${user}/video/${videoId}`);
  console.log(`caching ${user} ${videoId}`);
  const cached = await cache.match(cacheKey);
  if (!cached) {
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

    await cache.put(cacheKey, response.clone());
  }
}

export const extract: Provider['extract'] = async (match, url, _, debug, hostURL) => {
  const [, user, videoId] = match;
  const data = await getData(user, videoId);
  if (!data) return redirectDebug('Body match failed', url, debug);
  if (data.props.pageProps.statusCode === 10216) return redirectDebug('Video is private', url, debug);

  const videoData = data.props.pageProps.itemInfo.itemStruct;
  console.log(videoData);
  await cacheVideo(user, videoId, videoData.video.playAddr);
  await VEF_CACHE.put(`tiktok:${user}:${videoId}`, videoData.video.playAddr, { expirationTtl: 1440 }).catch(
    console.error
  );
  return {
    user: videoData.author.nickname
      ? `${videoData.author.nickname} (@${videoData.author.uniqueId})`
      : `@${videoData.author.uniqueId}`,
    title: videoData.desc,
    description: videoData.desc,
    url,
    themeColor: '#fe2c56',
    thumbnail: videoData.video.originCover,
    // videoURL: videoData.video.playAddr,
    videoURL: `https://${hostURL.hostname}/tiktokvideo?l=${encodeURIComponent(videoData.video.playAddr)}`,
    // videoURL: `https://${hostURL.hostname}/_tiktok/${user}/${videoId}`,
    width: videoData.video.width,
    height: videoData.video.height
  };
};
