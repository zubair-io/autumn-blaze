import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { BskyAgent } from "@atproto/api";
import { CollectableRegistryService } from "../services/collectable-registry.service";
import { BSkyService } from "../services/bsky.service";

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
const agent = new BskyAgent({
  service: "https://bsky.social",
});

// Helper function to authenticate with Bluesky
async function authenticateWithBluesky() {
  try {
    await agent.login({
      identifier: process.env.BSKY_USERNAME,
      password: process.env.BSKY_PASSWORD,
    });
    return true;
  } catch (error) {
    console.error("Authentication failed:", error);
    return false;
  }
}

function formatBskyResponse(response) {
  return response.data.posts.map((post: any) => {
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
}

async function getTopAFOLPost(context: InvocationContext): Promise<AFOLPost[]> {
  try {
    const isAuthenticated = await authenticateWithBluesky();
    if (!isAuthenticated) {
      throw new Error("Blue Sky is not authenticated");
    }
    const response = await agent.api.app.bsky.feed.searchPosts({
      q: "#afol",
      limit: 20,
      sort: "top",
    });

    if (!response.data.posts.length) {
      return [];
    }

    return formatBskyResponse(response);
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

export async function getReplies(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const registryID = request.params.id;

  const collectableRegistryService =
    await CollectableRegistryService.getInstance();

  const registry: any =
    await collectableRegistryService.getCollectableRegistryById(registryID);
  const bSkyService = await BSkyService.getInstance();

  const bskyPostId = registry.bskyPostId;
  const post = {
    text: "",
    img: "",
    bskyPostId,
  };
  if (!bskyPostId) {
    const text = `
    ${registry.title}
    ${registry.description}
      `;

    post.text = await bSkyService.generatePost(text, registry.provider);
    post.text = `${post.text}
https://justmaple.app/!/${registry._id}`;
    post.img = registry.images[0];
    const json = registry.toJSON();
    const postUri: string = await bSkyService.createPost(post.text, post.img);
    await collectableRegistryService.update(json._id, {
      ...json,
      bskyPostId: postUri,
    });
    post.bskyPostId = postUri;

    return {
      status: 200,
      jsonBody: [],
    };
  }

  return {
    status: 200,
    jsonBody: formatBskyResponse({
      data: {
        posts: (await bSkyService.getReplies(bskyPostId)).map((p) => {
          return p.post;
        }),
      },
    }),
  };
}

app.http("bsky", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: bskyPostByHashtag,
});

app.http("getReplies", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "bsky/replies/{id}",
  handler: getReplies,
});
