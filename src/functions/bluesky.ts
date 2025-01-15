import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BskyAgent } from "@atproto/api";

// Configuration interface
interface Config {
  BSKY_USERNAME: string;
  BSKY_PASSWORD: string;
}

// Media interface
interface PostMedia {
  type: string;
  alt: string;
  thumb?: string;
  fullsize: string;
}

// Post interface
interface AFOLPost {
  text: string;
  author: {
    handle: string;
    displayName: string;
    avatar: string;
  };
  postedAt: string;
  likes: number;
  reposts: number;
  media: PostMedia[];
}

async function getTopAFOLPost(context: InvocationContext): Promise<AFOLPost[]> {
  const config: Config = {
    BSKY_USERNAME: process.env.BSKY_USERNAME || "",
    BSKY_PASSWORD: process.env.BSKY_PASSWORD || "",
  };

  if (!config.BSKY_USERNAME || !config.BSKY_PASSWORD) {
    context.error("Missing Bluesky credentials in configuration");
    throw new Error("Missing required configuration");
  }

  const agent = new BskyAgent({
    service: "https://bsky.social",
  });

  try {
    // Login to Bluesky
    await agent.login({
      identifier: config.BSKY_USERNAME,
      password: config.BSKY_PASSWORD,
    });

    // Search for #afol posts
    const response = await agent.api.app.bsky.feed.searchPosts({
      q: "#afol",
      limit: 20,
      sort: "top",
    });

    if (!response.data.posts.length) {
      return [];
    }

    const posts = response.data.posts.map((post: any) => {
      // Extract media from the post
      const media: PostMedia[] = [];
      if (post.embed?.images) {
        media.push(
          ...post.embed.images.map((img: any) => ({
            type: "image",
            alt: img.alt,
            thumb: img.thumb,
            fullsize: img.fullsize,
          })),
        );
      } else if (post.embed?.media?.images) {
        // Handle nested media structure
        media.push(
          ...post.embed.media.images.map((img: any) => ({
            type: "image",
            alt: img.alt,
            thumb: img.thumb,
            fullsize: img.fullsize,
          })),
        );
      }

      // Handle external media if present
      if (post.embed?.external) {
        media.push({
          type: "external",
          alt: post.embed.external.title || "",
          thumb: post.embed.external.thumb,
          fullsize: post.embed.external.uri,
        });
      }

      return {
        text: post.record.text,
        author: {
          handle: post.author.handle,
          displayName: post.author.displayName || post.author.handle,
          avatar: post.author.avatar || "",
        },
        postedAt: new Date(post.indexedAt).toISOString(),
        likes: post.likeCount || 0,
        reposts: post.repostCount || 0,
        media,
      };
    });

    return posts;
  } catch (error) {
    context.error("Error fetching Bluesky posts:", error);
    throw error;
  }
}

export async function bskyPostByHashtag(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const posts = await getTopAFOLPost(context);

    return {
      status: 200,
      jsonBody: posts,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    };
  } catch (error) {
    context.error("Function failed:", error);
    return {
      status: 500,
      jsonBody: { message: "Internal server error" },
    };
  }
}

app.http("bsky", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: bskyPostByHashtag,
});
