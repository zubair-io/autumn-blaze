import { AtpAgent, RichText } from "@atproto/api";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import * as Sharp from "sharp";

const genAiResponseSchema = {
  type: SchemaType.OBJECT,
  properties: { response: { type: SchemaType.STRING } },
};
const genAI = new GoogleGenerativeAI(process.env.GEMINI);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: genAiResponseSchema,
  },
});

export class BSkyService {
  private static instance: BSkyService;

  agent = new AtpAgent({
    service: "https://bsky.social",
  });

  // Helper function to authenticate with Bluesky

  private constructor() {}

  static async getInstance(): Promise<BSkyService> {
    if (!BSkyService.instance) {
      BSkyService.instance = new BSkyService();
    }
    return BSkyService.instance;
  }

  async authenticateWithBluesky() {
    try {
      await this.agent.login({
        identifier: process.env.BSKY_USERNAME,
        password: process.env.BSKY_PASSWORD,
      });
      return true;
    } catch (error) {
      console.error("Authentication failed:", error);
      return false;
    }
  }

  async generatePost(text: string, provider: string) {
    const legoPrompt = `generate a social media post no more than 250 characters, the post should be fun but descriptive, Include lego related hashtags, you are to summarize the following text: 
  """  ${text} """
  
  Do not talk about building the set, and adding it to your collection. You can talk about its features. 
  `;
    const bookPrompt = `generate a social media post no more than 250 characters, the post should be fun but descriptive, Include book themed hashtags about the following book: 
    """  ${text} """
    no instagram or tiktok related hashtags
  `;
    const prompt = provider === "lego" ? legoPrompt : bookPrompt;

    const result = await model.generateContent(prompt);

    return JSON.parse(result.response.text()).response.trim() + " #maple";
  }

  async getReplies(uri: string) {
    if (!uri) {
      throw "uri is required";
    }

    // Authenticate with Bluesky
    const isAuthenticated = await this.authenticateWithBluesky();
    if (!isAuthenticated) {
      throw "Authentication failed";
    }

    // Get thread
    const threadResponse = await this.agent.getPostThread({
      uri,
    });

    // Extract replies from the thread
    const replies: any[] = (threadResponse.data.thread.replies || []) as any[];

    return replies;
  }

  async createPost(text: string, imageUrl: string) {
    if (!text) {
      throw "Text is required";
    }

    // Authenticate with Bluesky
    const isAuthenticated = await this.authenticateWithBluesky();
    if (!isAuthenticated) {
      throw "Authentication failed";
    }

    let postRef;

    if (imageUrl) {
      // Upload image
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const jpg = await Sharp(buffer)
        .resize({
          width: 1000,
          height: 1000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();

      const rt = new RichText({
        text,
      });
      await rt.detectFacets(this.agent); // automatically detects mentions and links
      const upload = await this.agent.uploadBlob(jpg, {
        encoding: "image/jpeg",
      });

      // Create post with image
      const postResult = await this.agent.post({
        $type: "app.bsky.feed.post",
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString(),
        embed: {
          $type: "app.bsky.embed.images",
          images: [
            {
              alt: "A Photo of the lego set",
              image: upload.data.blob,
            },
          ],
        },
      });

      postRef = postResult.uri;
    } else {
      // Create text-only post
      const postResult = await this.agent.post({
        text: text,
      });
      postRef = postResult.uri;
    }

    // Store the post URI for future reference
    // You might want to store this in a database
    //   const postId = postRef.split("/").pop();

    //   return {
    //     success: true,
    //     postId,
    //     postUri: postRef,
    //   };
    return postRef;
    // } catch (error) {
    //   throw error;
    // }
  }
}
