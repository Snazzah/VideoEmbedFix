import { Provider } from '../types';
import { fetchAndCache, redirectDebug } from '../util';

export const title = 'Twitter';
export const domains = [
  'twitter.com',
  'www.twitter.com',
  'm.twitter.com',
  'mobile.twitter.com',
  'fxtwitter.com',
  'www.fxtwitter.com'
];
export const regex =
  /^https?:\/\/(?:(?:www|m(?:obile)?)\.)?(?:fx)?twitter\.com\/(?:(?:i\/web|[^/]+)\/status|statuses)\/(\d+)/;

async function extractFromVMap(vmapUrl: string) {
  const [vmapResponse] = await fetchAndCache(vmapUrl);
  const vmapRegex =
    /<tw:videoVariant url="(https%3A%2F%2Fvideo\.twimg\.com%2F[^.>]+\.mp4)" content_type="video\/mp4" bit_rate="\d+"/;
  const vmap = await vmapResponse.text();
  const match = vmapRegex.exec(vmap);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

async function getGuestToken(): Promise<string> {
  const [tokenResponse] = await fetchAndCache('https://api.twitter.com/1.1/guest/activate.json', {
    method: 'POST',
    headers: {
      Authorization:
        'Bearer AAAAAAAAAAAAAAAAAAAAAPYXBAAAAAAACLXUNDekMxqa8h%2F40K4moUkGsoc%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw'
    }
  });
  const token: { guest_token: string } = await tokenResponse.json();
  console.log(`Got guest token (${token.guest_token})`);
  return token.guest_token;
}

export const extract: Provider['extract'] = async (match, url, _, debug) => {
  const [, statusId] = match;
  const token = await getGuestToken();

  const query = new URLSearchParams({
    cards_platform: 'Web-12',
    include_cards: '1',
    include_reply_count: '1',
    include_user_entities: '0',
    tweet_mode: 'extended'
  });

  const [tweetResponse] = await fetchAndCache(
    `https://api.twitter.com/1.1/statuses/show/${statusId}.json?${query.toString()}`,
    {
      headers: {
        Authorization:
          'Bearer AAAAAAAAAAAAAAAAAAAAAPYXBAAAAAAACLXUNDekMxqa8h%2F40K4moUkGsoc%3DTYfbDKbT3jJPCEVnMYqilB28NHfOPqkca3qaAxGfsyKCs0wRbw',
        'x-guest-token': token
      }
    }
  );

  const status: any = await tweetResponse.json();
  console.log(status);

  let tweetContent = status.full_text?.replace(/\n/g, ' ') || '';
  if (status.entities?.urls && tweetContent) {
    for (const url of status.entities.urls) tweetContent = tweetContent.replace(url.url, url.expanded_url);
  }

  const partialResult = {
    user: status.user.name ? `${status.user.name} (@${status.user.screen_name})` : `@${status.user.screen_name}`,
    title: tweetContent,
    description: tweetContent,
    url,
    themeColor: '#1da0f2'
  };

  // Amplify card
  if (status.card?.name === 'amplify') {
    const videoURL = await extractFromVMap(status.card.binding_values.amplify_url_vmap.string_value);
    if (videoURL)
      return {
        ...partialResult,
        thumbnail: 'https://pbs.twimg.com/cards/player-placeholder.png',
        videoURL,
        width: parseInt(status.card.binding_values.player_width.string_value, 10),
        height: parseInt(status.card.binding_values.player_height.string_value, 10)
      };
  }

  // Player card
  if (status.card?.name === 'player' && status.card.binding_values.player_stream_content_type)
    return {
      ...partialResult,
      thumbnail: status.card.binding_values.player_image.image_value.url,
      videoURL: status.card.binding_values.player_stream_url.string_value,
      width: parseInt(status.card.binding_values.player_width.string_value, 10),
      height: parseInt(status.card.binding_values.player_height.string_value, 10),
      mediaType: status.card.binding_values.player_stream_content_type.string_value.split(';')[0]
    };

  // promo_video_convo
  if (status.card?.name === 'promo_video_convo') {
    const videoURL = await extractFromVMap(status.card.binding_values.player_url.string_value);
    const cover = status.card.binding_values.cover_player_image.image_value;
    if (videoURL)
      return {
        ...partialResult,
        thumbnail: cover.url,
        videoURL,
        width: cover.width,
        height: cover.height,
        mediaType: status.card.binding_values.cover_player_stream_content_type.string_value.split(';')[0]
      };
  }

  // appplayer & video_direct_message & poll choices
  if (
    ['appplayer', 'poll2choice_video', 'poll3choice_video', 'poll4choice_video'].includes(status.card?.name) ||
    status.card?.name?.endsWith(':video_direct_message')
  ) {
    const videoURL = await extractFromVMap(status.card.binding_values.player_stream_url.string_value);
    const cover = status.card.binding_values.player_image.image_value;
    if (videoURL)
      return {
        ...partialResult,
        thumbnail: cover.url,
        videoURL,
        width: cover.width,
        height: cover.height
      };
  }

  if (!status.extended_entities?.media) return redirectDebug('No entities', url, debug);

  const media = status.extended_entities.media![0];
  if (media && media.type === 'video' && media.video_info?.variants) {
    const entity = media.video_info.variants
      .sort((a: { bitrate: number }, b: { bitrate: number }) => b.bitrate - a.bitrate)
      .find((v: { content_type: string }) => v.content_type === 'video/mp4');

    return {
      ...partialResult,
      thumbnail: media.media_url_https,
      videoURL: entity?.url || media.media_url,
      width: media.original_info.width,
      height: media.original_info.height
    };
  }

  return null;
};
